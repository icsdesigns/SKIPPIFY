import { sha256, sign, verify, type DeviceKeys } from "./crypto.js";
import { canonicalBytes } from "./canonical.js";

export type LhEvent = {
  v: 1; group: string; author: string; seq: number; hlc: string;
  epoch: number; type: string; coll?: string; body: unknown; sig: string;
};
export type UnsignedEvent = Omit<LhEvent, "sig">;

export function signEvent(e: UnsignedEvent, keys: DeviceKeys): LhEvent {
  return { ...e, sig: sign(canonicalBytes(e), keys.secretKey) };
}

export function verifyEvent(e: LhEvent): boolean {
  try {
    const { sig, ...unsigned } = e;
    return verify(canonicalBytes(unsigned), sig, e.author);
  } catch {
    return false;
  }
}

export function orderKey(e: Pick<LhEvent, "hlc" | "author">): string {
  return `${e.hlc}|${e.author}`;
}

export function eventHash(e: LhEvent): string {
  return sha256(canonicalBytes(e));
}

export function compareEvents(a: LhEvent, b: LhEvent): number {
  const ka = orderKey(a), kb = orderKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
