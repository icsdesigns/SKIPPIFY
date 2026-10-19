import { canonicalBytes } from "./canonical.js";
import {
  aeadDecrypt, aeadEncrypt, b64, deriveKey, hmac, openSealed, seal, sha256, sign, unb64, verify,
  type DeviceKeys,
} from "./crypto.js";
import type { Env, Group } from "./group.js";
import { FETCH_MARGIN_MS, INVITE_TTL_MS } from "./constants.js";
import { inboxTag, inviteTag, isEpochKey, sealNeed, type Need } from "./keys.js";
import type { Note } from "./storage.js";

export type Invite = { group: string; inviteId: string; secret: string; relays: string[] };
export type LinkCode = { group: string; person: string; relays: string[]; secret: string };
type LinkEntry = { secret: string; expires: number };

const enc = new TextEncoder();
const dec = new TextDecoder();
const INVITE_PREFIX = "lh1:";
const LINK_PREFIX = "lhl1:";
const KEY_CONTEXT = "localhost/invite-key";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function decode(code: string, prefix: string): Record<string, unknown> {
  if (code.startsWith(prefix)) {
    try {
      const v: unknown = JSON.parse(dec.decode(unb64(code.slice(prefix.length))));
      if (isObj(v)) return v;
    } catch { /* falls through */ }
  }
  throw new Error("código no válido");
}

export function encodeInvite(i: Invite): string {
  return INVITE_PREFIX + b64(canonicalBytes(i));
}
export function decodeInvite(code: string): Invite {
  const v = decode(code, INVITE_PREFIX);
  if (!isStr(v.group) || !isStr(v.inviteId) || !isStr(v.secret) || !strs(v.relays)) {
    throw new Error("invitación no válida");
  }
  return { group: v.group, inviteId: v.inviteId, secret: v.secret, relays: v.relays };
}
export function encodeLinkCode(c: LinkCode): string {
  return LINK_PREFIX + b64(canonicalBytes(c));
}
export function decodeLinkCode(code: string): LinkCode {
  const v = decode(code, LINK_PREFIX);
  if (!isStr(v.group) || !isStr(v.person) || !isStr(v.secret) || !strs(v.relays)) {
    throw new Error("código de vinculación no válido");
  }
  return { group: v.group, person: v.person, relays: v.relays, secret: v.secret };
}

const adInvite = (group: string) => enc.encode("localhost/invite|" + group);
const adLink = (group: string) => enc.encode("localhost/link|" + group);
const requestKey = (secret: string) => deriveKey(unb64(secret), KEY_CONTEXT);

function requestNote(secret: string, body: unknown, ad: Uint8Array, now: number): Note {
  const content = aeadEncrypt(canonicalBytes(body), requestKey(secret), ad);
  return { id: sha256(enc.encode(content)), tags: [inviteTag(secret)], createdAt: now, content };
}

export function joinRequest(i: Invite, keys: DeviceKeys, name: string, now: number): Note {
  const sig = sign(
    canonicalBytes({ group: i.group, inviteId: i.inviteId, device: keys.publicKey, name }),
    keys.secretKey,
  );
  return requestNote(
    i.secret, { inviteId: i.inviteId, device: keys.publicKey, name, sig }, adInvite(i.group), now,
  );
}

export function linkRequest(c: LinkCode, keys: DeviceKeys, name: string, now: number): Note {
  const proof = sign(canonicalBytes({ group: c.group, person: c.person }), keys.secretKey);
  return requestNote(c.secret, { device: keys.publicKey, name, proof }, adLink(c.group), now);
}

function openRequest(n: Note, secret: string, ad: Uint8Array): Record<string, unknown> | null {
  try {
    const plain = aeadDecrypt(n.content, requestKey(secret), ad);
    if (!plain) return null;
    const v: unknown = JSON.parse(dec.decode(plain));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

async function linkEntries(env: Env): Promise<LinkEntry[]> {
  return ((await env.storage.meta.get("linkCodes")) as LinkEntry[] | undefined) ?? [];
}

export async function addLinkCode(
  group: Group, env: Env, secret: string, expires: number,
): Promise<void> {
  await group.exclusive(async () => {
    const now = group.groupTime();
    const list = (await linkEntries(env)).filter((l) => l.expires > now);
    list.push({ secret, expires });
    await env.storage.meta.set("linkCodes", list);
  });
}

/**
 * Invites a request may still arrive through: those within their TTL, plus (R41) used ones whose
 * admitted device has authored nothing yet, with no age limit: its keyring delivery may have been lost.
 */
async function servableInvites(group: Group, env: Env, now: number): Promise<{ inviteId: string; secret: string; used: boolean; late?: true }[]> {
  const ms = group.membershipView();
  const out = new Map<string, { inviteId: string; secret: string; used: boolean; late?: true }>(
    ms.knownInvites(now).map((i) => [i.inviteId, i]),
  );
  for (const a of ms.admittedViaInvites()) {
    if (out.has(a.inviteId) || a.device === group.me.device) continue;
    if ((await env.storage.getEvents({ author: a.device, fromSeq: 1 })).length === 0) out.set(a.inviteId, { ...a, late: true });
  }
  return [...out.values()];
}

/** Invite tags for every servable invite plus every unexpired link code of this device. */
export async function requestTags(group: Group, env: Env, now: number): Promise<string[]> {
  const inv = (await servableInvites(group, env, now)).map((i) => inviteTag(i.secret));
  const links = (await linkEntries(env)).filter((l) => l.expires > now).map((l) => inviteTag(l.secret));
  return [...inv, ...links];
}

function personOfMember(group: Group, device: string) {
  const ms = group.membershipView();
  const person = ms.personOf(device);
  return person === undefined ? undefined : ms.members().find((m) => m.person === person);
}

/** Own device is a valid, non-removed member of a group it already has keys for. */
function canServe(group: Group): boolean {
  const m = personOfMember(group, group.me.device);
  return group.status === "ready" && m !== undefined && !m.removed;
}

const isMember = (group: Group, device: string) => personOfMember(group, device) !== undefined;

type Delivery = {
  group: string; to: string; keyring: Record<number, string>; relays: string[];
};
const signedPart = (d: Delivery) => canonicalBytes({
  group: d.group, to: d.to, keyring: d.keyring, relays: d.relays,
});
const macOf = (secret: string, payload: Record<string, unknown>) =>
  hmac(unb64(secret), dec.decode(canonicalBytes(payload)));

/**
 * Seals the full keyring into the inbox of `device` (published through the outbox), signed by
 * this device. With a `secret` (join / link flows) a MAC proves the sender knew it.
 */
export async function deliverKeyring(
  group: Group, env: Env, device: string, secret?: string,
): Promise<void> {
  const d: Delivery = {
    group: group.id, to: device, keyring: group.keyring(), relays: group.membershipView().relays(),
  };
  const payload: Record<string, unknown> = {
    ...d, from: group.me.device, sig: sign(signedPart(d), group.deviceKeys().secretKey),
  };
  if (secret !== undefined) payload.mac = macOf(secret, payload);
  const content = seal(canonicalBytes(payload), device);
  await env.storage.outbox.add({
    id: sha256(enc.encode(content)), tags: [inboxTag(device)], createdAt: group.groupTime(), content,
  });
}

type Parsed = Delivery & { from: string; sig: string };
function parseDelivery(v: unknown, group: Group): Parsed | null {
  if (!isObj(v) || v.group !== group.id || v.to !== group.me.device) return null;
  if (!isStr(v.from) || !isStr(v.sig) || !isObj(v.keyring) || !strs(v.relays)) return null;
  const keyring: Record<number, string> = {};
  for (const [k, x] of Object.entries(v.keyring)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 0) return null;
    if (!isEpochKey(x)) continue; // R59: not a 32-byte key: ignored
    keyring[n] = x;
  }
  if (v.mac !== undefined && !isStr(v.mac)) return null;
  return { group: v.group, to: v.to, keyring, relays: v.relays, from: v.from, sig: v.sig };
}

/**
 * Opens keyrings sealed for this device. Only authenticated deliveries count: signed by a valid
 * member (ready receiver, epochs capped at the latest rotation) or carrying the MAC of the
 * invite / link secret (joining receiver). Keys are only ever added, never overwritten.
 */
export async function handleInbox(group: Group, env: Env, notes: Note[]): Promise<Note[]> {
  const retry: Note[] = [];
  for (const n of notes) {
    const raw = openSealed(n.content, group.deviceKeys());
    if (!raw) continue;
    try {
      const v: unknown = JSON.parse(dec.decode(raw));
      const d = parseDelivery(v, group);
      if (!d || !verify(signedPart(d), d.sig, d.from)) continue;
      if (group.status === "joining") {
        const secret = (await env.storage.meta.get("joinSecret")) as string | undefined;
        const { mac, ...rest } = v as Record<string, unknown>;
        if (secret === undefined || mac === undefined || mac !== macOf(secret, rest)) continue;
      } else {
        const m = personOfMember(group, d.from);
        // Sender not in our (possibly stale) view yet: try again once more events arrive.
        if (!m) {
          retry.push(n);
          // R54: a restored device cannot yet see members admitted after its backup. A key matching
          // the check of a valid rotation in its own view is authentic whoever delivers it (R50).
          const proven = group.status === "restoring" ? group.provenKeys(d.keyring) : {};
          if (Object.keys(proven).length > 0) {
            await group.markRestoreDelivered();
            await group.adoptKeys(proven);
          }
          continue;
        }
        if (m.removed) continue;
        // Epochs advance one at a time; higher entries are ignored and the note is retried.
        const cap = (group.membershipView().epochs().at(-1)?.epoch ?? 0) + 1;
        const ok: Record<number, string> = {};
        for (const [k, x] of Object.entries(d.keyring)) if (Number(k) <= cap) ok[Number(k)] = x;
        if (Object.keys(ok).length < Object.keys(d.keyring).length) retry.push(n);
        d.keyring = ok;
      }
      if (group.status === "restoring") await group.markRestoreDelivered();
      await group.adoptKeys(d.keyring);
    } catch { /* malformed delivery */ }
  }
  return retry;
}

/** Validates join / link requests found under invite tags and answers them. */
export async function handleRequests(group: Group, env: Env, notes: Note[]): Promise<void> {
  if (!canServe(group)) return;
  for (const n of notes) {
    const now = group.groupTime();
    // Re-read each time: an earlier request in this loop may have used the invite.
    for (const i of await servableInvites(group, env, now)) {
      // Past its TTL an invite only answers a request that is still being re-offered (stale ones are leftovers).
      if (i.late && now - n.createdAt > INVITE_TTL_MS) continue;
      if (n.tags.includes(inviteTag(i.secret))) await serveJoin(group, env, n, i);
    }
    for (const l of await linkEntries(env)) {
      if (l.expires > now && n.tags.includes(inviteTag(l.secret))) await serveLink(group, env, n, l);
    }
  }
}

async function serveJoin(
  group: Group, env: Env, n: Note, inv: { inviteId: string; secret: string; used: boolean },
): Promise<void> {
  const b = openRequest(n, inv.secret, adInvite(group.id));
  if (!b || b.inviteId !== inv.inviteId || !isStr(b.device) || !isStr(b.name) || !isStr(b.sig)) return;
  const signed = canonicalBytes({
    group: group.id, inviteId: inv.inviteId, device: b.device, name: b.name,
  });
  if (!verify(signed, b.sig, b.device)) return;
  if (!inv.used && !isMember(group, b.device)) {
    await group.writeEvent("member.add", {
      device: b.device, person: b.device, name: b.name, inviteId: inv.inviteId,
    });
  }
  // A rejected member.add (the invite went to someone else first) must not leak the keyring;
  // a used invite only serves the device it admitted (re-delivery after a lost keyring).
  const m = personOfMember(group, b.device);
  if (!m || m.removed || group.membershipView().addedVia(b.device) !== inv.inviteId) return;
  // Joiners re-stamp their request each sync: answer again only to a fresher one.
  const key = `${b.device}|${inv.inviteId}`;
  const fresh = await group.exclusive(async () => {
    const served = ((await env.storage.meta.get("served")) as Record<string, number> | undefined) ?? {};
    if ((served[key] ?? -1) >= n.createdAt) return false;
    served[key] = n.createdAt;
    pruneServed(served, group.groupTime());
    await env.storage.meta.set("served", served);
    return true;
  });
  if (fresh) await deliverKeyring(group, env, b.device, inv.secret);
}

async function serveLink(group: Group, env: Env, n: Note, l: LinkEntry): Promise<void> {
  const b = openRequest(n, l.secret, adLink(group.id));
  if (!b || !isStr(b.device) || !isStr(b.proof)) return;
  const person = group.me.person;
  if (!verify(canonicalBytes({ group: group.id, person }), b.proof, b.device)) return;
  if (isMember(group, b.device)) return;
  await group.writeEvent("device.link", { device: b.device, person, proof: b.proof });
  if (group.membershipView().personOf(b.device) !== person) return;
  await group.exclusive(async () => {
    await env.storage.meta.set(
      "linkCodes", (await linkEntries(env)).filter((x) => x.secret !== l.secret),
    );
  });
  await deliverKeyring(group, env, b.device, l.secret);
}

function pruneServed(served: Record<string, number>, now: number): void {
  for (const [k, t] of Object.entries(served)) if (t < now - INVITE_TTL_MS) delete served[k];
}

const needBody = (group: string, device: string, epoch: number) =>
  canonicalBytes({ group, device, epoch });

/**
 * R31: a ready device that sees a valid latest rotation it has no key for asks the group for the
 * keyring, sealed under its newest key. Published on every sync while the gap lasts.
 */
export async function publishNeed(group: Group, env: Env): Promise<void> {
  const restoring = group.status === "restoring";
  if (group.status !== "ready" && !restoring) return;
  if (personOfMember(group, group.me.device)?.removed) return; // R47: a removed device asks nothing
  const latest = restoring ? group.currentEpoch() + 1 : group.membershipView().epochs().at(-1)?.epoch;
  const ring = group.keyring();
  if (latest === undefined || ring[latest] !== undefined) return;
  const sig = sign(needBody(group.id, group.me.device, latest), group.deviceKeys().secretKey);
  if (ring[0] === undefined) return;
  // R39: peers may no longer listen to the old epoch, so a restored device carries its own link.
  const [link] = restoring ? await env.storage.getEvents({ author: group.me.device, fromSeq: 1 }) : [];
  // R54: when the restore need first went out; a lone admin rotates only after INVITE_TTL_MS unanswered.
  if (restoring && (await env.storage.meta.get("restoreNeedSince")) === undefined) {
    await env.storage.meta.set("restoreNeedSince", group.groupTime());
  }
  const note = sealNeed(
    group.id, ring[0], { device: group.me.device, epoch: latest, sig, ...(link ? { link } : {}) }, group.groupTime(),
  );
  try { await env.transport.publish(note); } catch { /* retried next sync */ }
}

export type NeedAt = Need & { createdAt: number };

/** Any ready member answers a valid need from a valid non-removed device that holds the epoch. */
export async function handleNeeds(group: Group, env: Env, needs: NeedAt[]): Promise<void> {
  if (!canServe(group)) return;
  for (const nd of needs) {
    if (nd.device === group.me.device) continue;
    // R47: only epochs confirmed in our own view; the ring we deliver is limited the same way.
    // epoch+1 is a restored device asking "anything newer than what I have?", answered only when
    // we hold the latest rotation of our view.
    const latest = group.membershipView().epochs().at(-1)?.epoch ?? 0;
    const newer = nd.epoch === latest + 1 && group.currentEpoch() === latest;
    if (group.keyring()[nd.epoch] === undefined && !newer) continue;
    if (!verify(needBody(group.id, nd.device, nd.epoch), nd.sig, nd.device)) continue;
    const l = nd.link;
    if (l && l.type === "device.link" && l.author === nd.device && !isMember(group, nd.device)) {
      // R49: stored only if valid; a junk link would otherwise stay (and be republished) forever.
      try {
        if (!(await group.acceptsControl(l))) continue;
        await group.receive([l]);
      } catch { continue; }
    }
    const m = personOfMember(group, nd.device);
    if (!m || m.removed) continue;
    const key = `need|${nd.device}|${nd.epoch}`;
    const fresh = await group.exclusive(async () => {
      const served = ((await env.storage.meta.get("served")) as Record<string, number> | undefined) ?? {};
      // At most one delivery per (device, epoch); again only for a clearly later request.
      const last = served[key];
      if (last !== undefined && !(nd.createdAt > last + FETCH_MARGIN_MS)) return false;
      served[key] = group.groupTime();
      pruneServed(served, group.groupTime());
      await env.storage.meta.set("served", served);
      return true;
    });
    if (fresh) await deliverKeyring(group, env, nd.device);
  }
}

/** R28: an admin supersedes a rotation that predates a removal or still includes a removed device. */
export async function healRotation(group: Group): Promise<void> {
  if (!canServe(group)) return;
  const ms = group.membershipView();
  if (!ms.isAdmin(group.me.person) || !ms.needsRotation()) return;
  const latest = ms.epochs().at(-1)?.epoch ?? 0;
  if (group.keyring()[latest] === undefined) return;
  const devices = ms.members().filter((m) => !m.removed).flatMap((m) => m.devices);
  await group.writeEvent("epoch.rotate", group.rotation(devices));
}
