import { FUTURE_QUARANTINE_MS } from "./constants.js";

export type Clock = { now(): number };
export const systemClock: Clock = { now: () => Date.now() };

const MS_DIGITS = 15;
const C_DIGITS = 5;
const MAX_C = 10 ** C_DIGITS - 1;
const HLC_RE = /^([0-9]{15}):([0-9]{5})$/;

export function formatHlc(ms: number, c: number): string {
  return `${String(ms).padStart(MS_DIGITS, "0")}:${String(c).padStart(C_DIGITS, "0")}`;
}

export function parseHlc(s: string): { ms: number; c: number } {
  const m = HLC_RE.exec(s);
  if (!m) throw new Error(`invalid HLC: ${s}`);
  return { ms: Number(m[1]), c: Number(m[2]) };
}

export class Hlc {
  private _last: string;
  constructor(private readonly clock: Clock, last: string = formatHlc(0, 0)) {
    this._last = last;
  }

  get last(): string {
    return this._last;
  }

  tick(): string {
    const prev = parseHlc(this._last);
    let ms = Math.max(this.clock.now(), prev.ms);
    let c = ms === prev.ms ? prev.c + 1 : 0;
    if (c > MAX_C) { ms += 1; c = 0; } // counter would overflow its fixed width
    this._last = formatHlc(ms, c);
    return this._last;
  }

  /** Never call with quarantined (too-far-future) timestamps; OpLog guarantees that. */
  observe(remote: string): void {
    if (!HLC_RE.test(remote)) return;
    if (remote > this._last) this._last = remote;
  }
}

export function isTooFarInFuture(hlc: string, clock: Clock): boolean {
  return parseHlc(hlc).ms > clock.now() + FUTURE_QUARANTINE_MS;
}
