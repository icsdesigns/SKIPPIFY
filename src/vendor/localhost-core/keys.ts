import { canonicalBytes } from "./canonical.js";
import { MAX_NOTE_BYTES } from "./constants.js";
import {
  aeadDecrypt, aeadEncrypt, b64, hmac, openSealed, randomBytes, seal, sha256, unb64,
  type DeviceKeys,
} from "./crypto.js";
import type { LhEvent } from "./event.js";
import type { Note, Snapshot } from "./storage.js";

/** época -> llave de época en base64url */
export type Keyring = Record<number, string>;

export type Payload =
  | { kind: "events"; events: LhEvent[] }
  | { kind: "have"; device: string; vector: Record<string, number>; at: number; sig: string }
  | { kind: "snapshot"; author: string; snapshot: Snapshot; sig: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

// nonce (24) + etiqueta Poly1305 (16)
const AEAD_OVERHEAD = 24 + 16;

export function newEpochKey(): string {
  return b64(randomBytes(32));
}

export function groupTag(groupId: string, epochKey: string): string {
  return hmac(unb64(epochKey), "localhost/group|" + groupId);
}

/** R59: an epoch key is valid base64url of exactly 32 bytes (HMAC would accept a zero-padded one). */
export function isEpochKey(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try { return unb64(v).length === 32; } catch { return false; }
}

/** R50: commitment to an epoch key, published in its epoch.rotate so a holder can tell a losing rotation's key. */
export function keyCheck(groupId: string, epoch: number, key: string): string {
  return hmac(unb64(key), "localhost/keycheck|" + groupId + "|" + epoch);
}

export function inboxTag(devicePk: string): string {
  return hmac(unb64(devicePk), "localhost/inbox");
}

export function inviteTag(secret: string): string {
  const s = unb64(secret);
  const tail = enc.encode("localhost/invite");
  const buf = new Uint8Array(s.length + tail.length);
  buf.set(s, 0);
  buf.set(tail, s.length);
  return sha256(buf);
}

const adFor = (groupId: string, epoch: number) => enc.encode(groupId + "|" + epoch);

/** Longitud del contenido (base64url ASCII, sin relleno) para un texto en claro de `plainLen` bytes. */
const contentLen = (plainLen: number) => Math.floor(((plainLen + AEAD_OVERHEAD) * 4 + 2) / 3);

function makeNote(
  groupId: string, epoch: number, key: string, p: Payload, now: number, tooBig: string,
): Note {
  const content = aeadEncrypt(canonicalBytes(p), unb64(key), adFor(groupId, epoch));
  if (enc.encode(content).length > MAX_NOTE_BYTES) throw new Error(tooBig);
  return { id: sha256(enc.encode(content)), tags: [groupTag(groupId, key)], createdAt: now, content };
}

export function sealNotes(
  groupId: string, epoch: number, key: string, p: Payload, now: number,
): Note[] {
  if (p.kind === "have") return [makeNote(groupId, epoch, key, p, now, "parte demasiado grande")];
  if (p.kind === "snapshot") {
    return [makeNote(groupId, epoch, key, p, now, "instantánea demasiado grande")];
  }
  // Texto en claro de {"events":[...],"kind":"events"} = envoltorio + eventos + comas.
  const wrapper = canonicalBytes({ kind: "events", events: [] }).length;
  const chunks: LhEvent[][] = [];
  let cur: LhEvent[] = [];
  let plain = wrapper;
  for (const e of p.events) {
    const len = canonicalBytes(e).length;
    if (contentLen(wrapper + len) > MAX_NOTE_BYTES) throw new Error("evento demasiado grande");
    if (cur.length > 0 && contentLen(plain + len + 1) > MAX_NOTE_BYTES) {
      chunks.push(cur);
      cur = [];
      plain = wrapper;
    }
    plain += len + (cur.length > 0 ? 1 : 0);
    cur.push(e);
  }
  if (cur.length > 0 || chunks.length === 0) chunks.push(cur);
  return chunks.map((events) =>
    makeNote(groupId, epoch, key, { kind: "events", events }, now, "evento demasiado grande"));
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function isPayload(x: unknown): x is Payload {
  if (!isRecord(x)) return false;
  switch (x.kind) {
    case "events":
      return Array.isArray(x.events);
    case "have":
      return typeof x.device === "string" && isRecord(x.vector) &&
        typeof x.at === "number" && typeof x.sig === "string" &&
        Object.values(x.vector).every((n) => typeof n === "number");
    case "snapshot":
      return typeof x.author === "string" && typeof x.sig === "string" && isRecord(x.snapshot);
    default:
      return false;
  }
}

export function openNote(
  n: Note, groupId: string, tagToEpoch: Map<string, number>, ring: Keyring,
): Payload | null {
  try {
    let epoch: number | undefined;
    for (const t of n.tags) {
      const e = tagToEpoch.get(t);
      if (e !== undefined) { epoch = e; break; }
    }
    if (epoch === undefined) return null;
    const key = ring[epoch];
    if (key === undefined) return null;
    const plain = aeadDecrypt(n.content, unb64(key), adFor(groupId, epoch));
    if (!plain) return null;
    const parsed: unknown = JSON.parse(dec.decode(plain));
    return isPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function rotateEnvelopes(newKey: string, devices: string[]): Record<string, string> {
  const raw = unb64(newKey);
  const out: Record<string, string> = {};
  for (const d of devices) out[d] = seal(raw, d);
  return out;
}

export function openEnvelope(env: string, keys: DeviceKeys): string | null {
  const raw = openSealed(env, keys);
  return raw ? b64(raw) : null;
}

/** `link`: the requester's own signed device.link event, for a restored device peers have not seen yet (R39). */
export type Need = { device: string; epoch: number; sig: string; link?: LhEvent };

/** Fixed tag for key requests: it never ages out like an epoch tag does. */
export function needTag(groupId: string, key0: string): string {
  return hmac(unb64(key0), "localhost/need|" + groupId);
}

const adNeed = (groupId: string) => enc.encode("localhost/need|" + groupId);

export function sealNeed(groupId: string, key0: string, need: Need, now: number): Note {
  const content = aeadEncrypt(canonicalBytes(need), unb64(key0), adNeed(groupId));
  return { id: sha256(enc.encode(content)), tags: [needTag(groupId, key0)], createdAt: now, content };
}

export function openNeed(n: Note, groupId: string, key0: string): Need | null {
  try {
    const plain = aeadDecrypt(n.content, unb64(key0), adNeed(groupId));
    if (!plain) return null;
    const x: unknown = JSON.parse(dec.decode(plain));
    if (!isRecord(x) || typeof x.device !== "string" || typeof x.epoch !== "number" || typeof x.sig !== "string") {
      return null;
    }
    return {
      device: x.device, epoch: x.epoch, sig: x.sig,
      ...(isRecord(x.link) ? { link: x.link as unknown as LhEvent } : {}),
    };
  } catch {
    return null;
  }
}
