import { canonicalBytes } from "./canonical.js";
import {
  aeadDecrypt, aeadEncrypt, b64, defaultKdf, isKdfParams, passwordKey, randomBytes, unb64,
  type DeviceKeys, type KdfParams,
} from "./crypto.js";
import { signEvent, verifyEvent, type LhEvent } from "./event.js";
import { Hlc, type Clock } from "./hlc.js";
import type { Keyring } from "./keys.js";
import { buildMembership, CONTROL_TYPES } from "./membership.js";
import { isWellFormed } from "./oplog.js";
import type { Snapshot } from "./storage.js";

export type BackupPayload = {
  group: string; deviceKeys: DeviceKeys; person: string; keyring: Keyring; relays: string[];
  events: LhEvent[]; base: Snapshot | null; baseAuthor: string | null;
};

const AD = new TextEncoder().encode("localhost-backup");
const KDF_ALG = "argon2id13";
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Encrypted backup file: the payload sealed under a key derived from the password (Argon2id). */
export function encodeBackup(payload: BackupPayload, password: string, kdf: KdfParams = defaultKdf()): string {
  const salt = randomBytes(16);
  const box = aeadEncrypt(canonicalBytes(payload), passwordKey(password, salt, kdf), AD);
  return JSON.stringify({
    format: "localhost-backup", v: 1, kdf: { alg: KDF_ALG, opslimit: kdf.opslimit, memlimit: kdf.memlimit },
    salt: b64(salt), box,
  });
}

/** The cost parameters the file was sealed with (R52); a file without them used the defaults. */
function kdfOf(file: Record<string, unknown>): KdfParams {
  if (file.kdf === undefined) return defaultKdf();
  const k = file.kdf;
  if (!isObj(k) || k.alg !== KDF_ALG || typeof k.opslimit !== "number" || typeof k.memlimit !== "number") {
    throw new Error("copia no válida");
  }
  const p = { opslimit: k.opslimit, memlimit: k.memlimit };
  if (!isKdfParams(p)) throw new Error("copia no válida");
  return p;
}

/** Throws "contraseña incorrecta" (wrong password) or "copia no válida" (not a backup). */
export function decodeBackup(text: string, password: string): BackupPayload {
  let file: unknown;
  try { file = JSON.parse(text); } catch { throw new Error("copia no válida"); }
  if (!isObj(file) || file.format !== "localhost-backup" || file.v !== 1
    || !isStr(file.salt) || !isStr(file.box)) throw new Error("copia no válida");
  const kdf = kdfOf(file);
  let plain: Uint8Array | null;
  try { plain = aeadDecrypt(file.box, passwordKey(password, unb64(file.salt), kdf), AD); } catch { plain = null; }
  if (!plain) throw new Error("contraseña incorrecta");
  let p: unknown;
  try { p = JSON.parse(new TextDecoder().decode(plain)); } catch { throw new Error("copia no válida"); }
  if (!isObj(p) || !isStr(p.group) || !isStr(p.person) || !isObj(p.keyring) || !isObj(p.deviceKeys)
    || !isStr(p.deviceKeys.publicKey) || !isStr(p.deviceKeys.secretKey)
    || !Array.isArray(p.relays) || !Array.isArray(p.events)
    || !(p.base === null || isObj(p.base)) || !(p.baseAuthor === null || isStr(p.baseAuthor))) {
    throw new Error("copia no válida");
  }
  return p as unknown as BackupPayload;
}

/**
 * R40: in memory only, would the new device be a valid member once its device.link joins the
 * backup's control events? Mirrors what restore writes, without touching any storage.
 */
export function canRestore(b: BackupPayload, device: DeviceKeys, cert: string, clock: Clock): boolean {
  const hlc = new Hlc(clock);
  for (const e of b.events) if (isWellFormed(e)) hlc.observe(e.hlc);
  if (b.base) hlc.observe(b.base.hlcUntil);
  const epoch = Math.max(-1, ...Object.keys(b.keyring).map(Number));
  const link = signEvent({
    v: 1, group: b.group, author: device.publicKey, seq: 1, hlc: hlc.tick(), epoch: Math.max(epoch, 0),
    type: "device.link", body: { device: device.publicKey, person: b.person, cert },
  }, device);
  const control = [...b.events, ...(b.base?.control ?? [])].filter((e) =>
    isWellFormed(e) && e.group === b.group && CONTROL_TYPES.has(e.type) && verifyEvent(e));
  return buildMembership([...control, link], b.group).validAt(link);
}
