import { canonicalBytes } from "./canonical.js";
import { sha256, verify } from "./crypto.js";
import { compareEvents, eventHash, orderKey, type LhEvent } from "./event.js";
import { parseHlc } from "./hlc.js";

export type Member = {
  person: string; name: string; devices: string[]; admin: boolean; removed: boolean;
};
export type Membership = {
  /** ¿El autor podía escribir `e` en su posición del orden? */
  validAt(e: LhEvent): boolean;
  members(): Member[];
  personOf(device: string): string | undefined;
  isAdmin(person: string): boolean;
  activeInvites(now: number): { inviteId: string; secret: string; expires: number }[];
  epochs(): { epoch: number; rotateHlc: string; envelopes: Record<string, string>; check: string; author: string; seq: number }[];
  relays(): string[];
  /** Invites created within their TTL (used or not): requesters may still need a keyring. */
  knownInvites(now: number): { inviteId: string; secret: string; expires: number; used: boolean }[];
  /** Used invites with the device each admitted: that device may still need its keyring (R41). */
  admittedViaInvites(): { inviteId: string; secret: string; expires: number; used: boolean; device: string }[];
  /** Invite through which `device` was added (undefined for creators and linked devices). */
  addedVia(device: string): string | undefined;
  /** Is `target` an admin strictly more senior than `actor` (R11)? */
  outranks(target: string, actor: string): boolean;
  /** R28: a removal postdates the latest rotation, or that rotation still includes a removed device. */
  needsRotation(): boolean;
  /** Is `seq` of `device` past the cutoff of a removal (so that event is invalid)? */
  pastCutoff(device: string, seq: number): boolean;
};

export const CONTROL_TYPES = new Set<string>([
  "group.create", "invite.create", "member.add", "member.remove", "device.link",
  "admin.grant", "admin.revoke", "epoch.rotate", "relays.set",
]);

type PersonState = {
  person: string; name: string; devices: string[]; admin: boolean;
  /** orderKey at which the person became admin (lower = more senior). */
  seniority?: string;
  removed: boolean; cutoff: Map<string, number>; removedKey?: string;
};
/** `revoked`: a later member.remove invalidated it while still unused (R48). */
type Invite = { inviteId: string; secret: string; expires: number; used: boolean; revoked?: true };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isSeq = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function stringRecord(v: unknown): Record<string, string> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!isStr(x)) return undefined;
    out[k] = x;
  }
  return out;
}

/** Group id: binds the group to its creator so nobody else can forge a group.create for it. */
export function groupIdFor(creator: string, nonce: string): string {
  return sha256(canonicalBytes({ creator, nonce }));
}

function hlcOk(hlc: string): boolean {
  try { parseHlc(hlc); return true; } catch { return false; }
}

export function buildMembership(controlEvents: LhEvent[], groupId: string): Membership {
  const hashed = controlEvents.filter((e) => e.group === groupId).map((e) => ({ e, h: eventHash(e) }));
  const seen = new Set<string>();
  const sorted = hashed
    .filter(({ h }) => (seen.has(h) ? false : (seen.add(h), true)))
    .sort((a, b) => compareEvents(a.e, b.e) || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));

  function run(excluded: Set<string>) {
  let created = false;
  const addedKey = new Map<string, string>(); // device -> orderKey where it was added
  const addedInvite = new Map<string, string>(); // device -> inviteId it came through
  let lastRotateKey: string | undefined;
  const personOfDevice = new Map<string, string>();
  const persons = new Map<string, PersonState>();
  const invites = new Map<string, Invite>();
  const decisions = new Map<string, boolean>(); // eventHash -> valid
  const epochList: { epoch: number; rotateHlc: string; envelopes: Record<string, string>; check: string; author: string; seq: number }[] = [];
  let currentEpoch = 0;
  let relayList: string[] = [];

  /** Is `device` allowed to author an event with this seq/group at orderKey `key`? */
  function authorOk(group: string, device: string, seq: number, key: string, hlc: string): PersonState | undefined {
    if (!created || group !== groupId) return undefined;
    if (!hlcOk(hlc)) return undefined;
    const added = addedKey.get(device);
    if (added === undefined || !(added < key)) return undefined;
    const p = persons.get(personOfDevice.get(device)!);
    if (!p) return undefined;
    if (p.removed && !(seq <= (p.cutoff.get(device) ?? 0))) return undefined;
    return p;
  }

  /** Target is a currently-admin person strictly more senior than the acting person (R11). */
  function outranks(target: PersonState, actor: PersonState): boolean {
    return target.admin && target.seniority !== undefined && actor.seniority !== undefined
      && target.seniority < actor.seniority;
  }

  function addDevice(person: PersonState, device: string, key: string): void {
    addedKey.set(device, key);
    personOfDevice.set(device, person.person);
    person.devices.push(device);
  }

  /**
   * device.link form (b): the NEW device authors it (seq 1), carrying a certificate signed by
   * an existing, non-removed device of `person`. It counts as added at its own orderKey.
   */
  function applyCertLink(e: LhEvent, b: Record<string, unknown>, key: string): boolean {
    if (!created || e.group !== groupId || !hlcOk(e.hlc) || e.seq !== 1) return false;
    if (!isStr(b.device) || !isStr(b.person) || !isStr(b.cert)) return false;
    if (b.device !== e.author || addedKey.has(b.device)) return false;
    const p = persons.get(b.person);
    if (!p || p.removed) return false;
    const msg = canonicalBytes({ group: e.group, person: b.person, device: b.device });
    const cert = b.cert;
    const certified = p.devices.some((d) => {
      try { return verify(msg, cert, d); } catch { return false; }
    });
    if (!certified) return false;
    addDevice(p, b.device, key);
    return true;
  }

  function apply(e: LhEvent): boolean {
    const key = orderKey(e);
    const b = e.body;
    if (e.type === "group.create") {
      if (created) return false;
      if (!isObj(b) || !isStrArray(b.relays) || !isStr(b.nonce)) return false;
      if (e.seq !== 1 || !hlcOk(e.hlc) || e.group !== groupIdFor(e.author, b.nonce)) return false;
      created = true;
      const p: PersonState = {
        person: e.author, name: "", devices: [], admin: true, seniority: key, removed: false, cutoff: new Map(),
      };
      persons.set(p.person, p);
      addDevice(p, e.author, key);
      relayList = b.relays;
      return true;
    }
    if (e.type === "device.link" && isObj(b) && isStr(b.cert)) return applyCertLink(e, b, key);
    const author = authorOk(e.group, e.author, e.seq, key, e.hlc);
    if (!author) return false;
    const isAdmin = author.admin && !author.removed;

    switch (e.type) {
      case "invite.create": {
        if (!isAdmin || !isObj(b)) return false;
        if (!isStr(b.inviteId) || !isStr(b.secret) || !isSeq(b.expires)) return false;
        if (invites.has(b.inviteId)) return false;
        invites.set(b.inviteId, { inviteId: b.inviteId, secret: b.secret, expires: b.expires, used: false });
        return true;
      }
      case "member.add": {
        if (!isObj(b) || !isStr(b.device) || !isStr(b.inviteId) || !isStr(b.name)) return false;
        if (b.person !== undefined && !isStr(b.person)) return false;
        const person = b.person ?? b.device;
        const inv = invites.get(b.inviteId);
        if (!inv || inv.used || inv.revoked) return false;
        let ms: number;
        try { ms = parseHlc(e.hlc).ms; } catch { return false; }
        if (!(ms < inv.expires)) return false;
        if (addedKey.has(b.device) || persons.has(person)) return false;
        inv.used = true;
        addedInvite.set(b.device, b.inviteId);
        const p: PersonState = {
          person, name: b.name, devices: [], admin: false, removed: false, cutoff: new Map(),
        };
        persons.set(person, p);
        addDevice(p, b.device, key);
        return true;
      }
      case "member.remove": {
        if (!isAdmin || !isObj(b) || !isStr(b.person) || !isObj(b.cutoff)) return false;
        const target = persons.get(b.person);
        if (!target || target.removed || outranks(target, author)) return false;
        const cutoff = new Map<string, number>();
        for (const [d, s] of Object.entries(b.cutoff)) {
          if (!isSeq(s)) return false;
          cutoff.set(d, s);
        }
        target.removed = true;
        target.removedKey = key;
        target.cutoff = cutoff;
        // R48: the removed person may have read any pending invite's secret in the log.
        for (const inv of invites.values()) if (!inv.used) inv.revoked = true;
        return true;
      }
      case "device.link": {
        if (!isObj(b) || !isStr(b.device) || !isStr(b.person) || !isStr(b.proof)) return false;
        if (author.person !== b.person || addedKey.has(b.device)) return false;
        let ok = false;
        try { ok = verify(canonicalBytes({ group: e.group, person: b.person }), b.proof, b.device); } catch { ok = false; }
        if (!ok) return false;
        addDevice(author, b.device, key);
        return true;
      }
      case "admin.grant":
      case "admin.revoke": {
        if (!isAdmin || !isObj(b) || !isStr(b.person)) return false;
        const target = persons.get(b.person);
        if (!target || target.removed) return false;
        if (e.type === "admin.revoke") {
          if (outranks(target, author)) return false;
          target.admin = false;
          target.seniority = undefined;
        } else if (!target.admin) {
          target.admin = true;
          target.seniority = key;
        }
        return true;
      }
      case "epoch.rotate": {
        // R50: `check` commits to the key, so a holder can tell a losing rotation's key.
        if (!isAdmin || !isObj(b) || !isSeq(b.epoch) || !isStr(b.check)) return false;
        const envelopes = stringRecord(b.envelopes);
        if (!envelopes || b.epoch !== currentEpoch + 1) return false;
        currentEpoch = b.epoch;
        lastRotateKey = key;
        epochList.push({ epoch: b.epoch, rotateHlc: e.hlc, envelopes, check: b.check, author: e.author, seq: e.seq });
        return true;
      }
      case "relays.set": {
        if (!isAdmin || !isObj(b) || !isStrArray(b.relays)) return false;
        relayList = b.relays;
        return true;
      }
      default:
        return false;
    }
  }

  for (const { e, h } of sorted) {
    decisions.set(h, !excluded.has(h) && CONTROL_TYPES.has(e.type) ? apply(e) : false);
  }

  /** Events (accepted or not) authored past the seq cutoff of a person removed in this run. */
  const newlyExcluded: string[] = [];
  for (const { e, h } of sorted) {
    const p = persons.get(personOfDevice.get(e.author) ?? "");
    if (p?.removed && e.seq > (p.cutoff.get(e.author) ?? 0)) newlyExcluded.push(h);
  }
  return {
    newlyExcluded, decisions, persons, personOfDevice, invites, epochList, relayList, authorOk,
    addedKey, addedInvite, lastRotateKey: () => lastRotateKey,
  };
  }

  // R9/R12: E0 = {}; E(k+1) = events past a cutoff set by removals accepted in run(E(k)),
  // recomputed from scratch each round. Stop at a fixpoint; on a cycle (or the round cap) use
  // the union of the sets involved, which is deterministic.
  const keyOf = (x: Set<string>) => [...x].sort().join(",");
  const union = (xs: Set<string>[]) => new Set(xs.flatMap((x) => [...x]));
  const history: Set<string>[] = [new Set()];
  let r = run(history[0]!);
  for (let round = 0; ; round++) {
    const next = new Set(r.newlyExcluded);
    const nk = keyOf(next);
    const cur = history[history.length - 1]!;
    if (nk === keyOf(cur)) break;
    const seenAt = history.findIndex((h) => keyOf(h) === nk);
    if (seenAt >= 0) { r = run(union(history.slice(seenAt))); break; }
    if (round >= sorted.length + 2) { r = run(union(history)); break; }
    history.push(next);
    r = run(next);
  }
  const {
    decisions, persons, personOfDevice, invites, epochList, relayList, authorOk, addedKey, addedInvite,
  } = r;
  const rotateKey = r.lastRotateKey();
  const outranksFn = (target: PersonState, actor: PersonState) =>
    target.admin && target.seniority !== undefined && actor.seniority !== undefined
    && target.seniority < actor.seniority;

  return {
    validAt(e) {
      if (CONTROL_TYPES.has(e.type)) return decisions.get(eventHash(e)) === true;
      return authorOk(e.group, e.author, e.seq, orderKey(e), e.hlc) !== undefined;
    },
    members() {
      return [...persons.values()].map((p) => ({
        person: p.person, name: p.name, devices: [...p.devices],
        admin: p.admin && !p.removed, removed: p.removed,
      }));
    },
    personOf: (device) => personOfDevice.get(device),
    isAdmin(person) {
      const p = persons.get(person);
      return !!p && p.admin && !p.removed;
    },
    activeInvites(now) {
      return [...invites.values()]
        .filter((i) => !i.used && !i.revoked && i.expires > now)
        .map(({ inviteId, secret, expires }) => ({ inviteId, secret, expires }));
    },
    knownInvites: (now) => [...invites.values()]
      .filter((i) => !i.revoked && i.expires > now)
      .map(({ inviteId, secret, expires, used }) => ({ inviteId, secret, expires, used })),
    admittedViaInvites: () => [...addedInvite].flatMap(([device, id]) => {
      const i = invites.get(id);
      return i ? [{ inviteId: i.inviteId, secret: i.secret, expires: i.expires, used: i.used, device }] : [];
    }),
    addedVia: (device) => addedInvite.get(device),
    outranks(target, actor) {
      const t = persons.get(target), a = persons.get(actor);
      return !!t && !!a && outranksFn(t, a);
    },
    pastCutoff(device, seq) {
      const p = persons.get(personOfDevice.get(device) ?? "");
      return !!p?.removed && seq > (p.cutoff.get(device) ?? 0);
    },
    needsRotation() {
      const removed = [...persons.values()].filter((p) => p.removed);
      if (removed.length === 0) return false;
      const last = epochList[epochList.length - 1];
      if (!last || rotateKey === undefined) return true;
      return removed.some((p) =>
        (p.removedKey !== undefined && p.removedKey > rotateKey) ||
        p.devices.some((d) => last.envelopes[d] !== undefined));
    },
    epochs: () => epochList.map((x) => ({ ...x })),
    relays: () => [...relayList],
  };
}
