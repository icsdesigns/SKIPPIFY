import { generateKeyBetween } from "fractional-indexing";
import { eventHash, verifyEvent, type LhEvent } from "./event.js";
import { isTooFarInFuture, parseHlc, type Clock } from "./hlc.js";
import type { Storage } from "./storage.js";

const MAX_SEQ = 2 ** 31 - 1;
const MAX_GAPS_PER_AUTHOR = 1000;

const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isInt = (x: unknown, min: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min;

function validPos(p: unknown): boolean {
  if (typeof p !== "string") return false;
  try { generateKeyBetween(p, null); return true; } catch { return false; }
}

/** Structural validation of untrusted input; never throws. */
export function isWellFormed(e: unknown): e is LhEvent {
  try {
    if (typeof e !== "object" || e === null) return false;
    const x = e as Record<string, unknown>;
    if (x.v !== 1 || !isStr(x.group) || !isStr(x.author) || !isStr(x.type)) return false;
    if (!isInt(x.seq, 1) || x.seq > MAX_SEQ || !isInt(x.epoch, 0)) return false;
    if (x.coll !== undefined && !isStr(x.coll)) return false;
    const needsColl = typeof x.type === "string" && /^(rec|list)\./.test(x.type);
    if (needsColl && x.coll === undefined) return false;
    if (typeof x.hlc !== "string") return false;
    parseHlc(x.hlc);
    const body = x.body as Record<string, unknown> | null;
    switch (x.type) {
      case "rec.add":
      case "rec.remove":
      case "list.remove":
        return typeof body === "object" && body !== null && isStr(body.id);
      case "list.insert":
      case "list.move":
        return typeof body === "object" && body !== null && isStr(body.id) && validPos(body.pos);
      default:
        return true;
    }
  } catch {
    return false;
  }
}

type IngestResult = {
  added: LhEvent[]; quarantined: LhEvent[]; rejected: LhEvent[]; replaced: LhEvent[];
};

export class OpLog {
  private chain: Promise<unknown> = Promise.resolve();
  /** Vector of the snapshot this log was bootstrapped from: those seqs are covered without being stored. */
  private base: Record<string, number> = {};

  constructor(
    private readonly storage: Storage,
    private readonly clock: Clock,
    private readonly groupId: string,
  ) {}

  /** Serialized: concurrent calls run one after another so read-decide-write is atomic. */
  ingest(evs: LhEvent[]): Promise<IngestResult> {
    const run = this.chain.then(() => this.ingestNow(evs));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async ingestNow(evs: LhEvent[]): Promise<IngestResult> {
    const added: LhEvent[] = [], quarantined: LhEvent[] = [], rejected: LhEvent[] = [];
    const replaced: LhEvent[] = [];
    for (const e of evs) {
      if (!isWellFormed(e) || e.group !== this.groupId || !verifyEvent(e)) { rejected.push(e); continue; }
      if (isTooFarInFuture(e.hlc, this.clock)) { quarantined.push(e); continue; }
      const [cur] = await this.storage.getEvents({ author: e.author, fromSeq: e.seq });
      if (cur && cur.seq === e.seq) {
        // Same (author, seq): keep the lowest eventHash (equivocation).
        if (eventHash(e) >= eventHash(cur)) continue;
        const i = added.findIndex((x) => x.author === cur.author && x.seq === cur.seq);
        if (i >= 0) added.splice(i, 1); // superseded within this batch: never visible
        else replaced.push(cur);
      }
      await this.storage.putEvents([e]);
      added.push(e);
    }
    return { added, quarantined, rejected, replaced };
  }
  setBase(vector: Record<string, number> | undefined): void {
    this.base = vector ?? {};
  }

  /** Highest contiguous seq per author, counting from the base snapshot's vector when there is one. */
  async vector(): Promise<Record<string, number>> {
    if (Object.keys(this.base).length === 0) return this.storage.getVector();
    const have = new Map<string, Set<number>>();
    for (const e of await this.storage.getEvents({})) {
      let s = have.get(e.author);
      if (!s) have.set(e.author, (s = new Set()));
      s.add(e.seq);
    }
    const out: Record<string, number> = {};
    for (const au of new Set([...have.keys(), ...Object.keys(this.base)])) {
      let n = this.base[au] ?? 0;
      const s = have.get(au);
      while (s?.has(n + 1)) n++;
      if (n > 0) out[au] = n;
    }
    return out;
  }

  /** Missing seqs below the highest received, per author. */
  async gaps(): Promise<Record<string, number[]>> {
    const out: Record<string, number[]> = {};
    const byAuthor = new Map<string, Set<number>>();
    for (const e of await this.storage.getEvents({})) {
      let s = byAuthor.get(e.author);
      if (!s) byAuthor.set(e.author, (s = new Set()));
      s.add(e.seq);
    }
    for (const [au, s] of byAuthor) {
      let max = 0;
      for (const n of s) if (n > max) max = n;
      const missing: number[] = [];
      for (let i = (this.base[au] ?? 0) + 1; i < max && missing.length < MAX_GAPS_PER_AUTHOR; i++) {
        if (!s.has(i)) missing.push(i);
      }
      if (missing.length) out[au] = missing;
    }
    return out;
  }

  all(): Promise<LhEvent[]> {
    return this.storage.getEvents({});
  }
}
