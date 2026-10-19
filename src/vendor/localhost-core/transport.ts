import type { Note } from "./storage.js";

export interface Transport {
  publish(note: Note): Promise<{ relay: string; ok: boolean }[]>;
  /** Rejects when no relay responded; `relays` says which ones did. */
  fetch(tags: string[], since: number): Promise<{ notes: Note[]; relays: { relay: string; ok: boolean }[] }>;
}

/** mulberry32: small seeded PRNG so network chaos is reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-memory fake relays. Each relay stores its notes separately. */
export class MemoryTransport implements Transport {
  down = new Set<string>();
  dropRate = 0;
  dupRate = 0;
  rng: () => number;
  private readonly stores = new Map<string, Map<string, Note>>();

  constructor(readonly relays: string[], seed = 1) {
    this.rng = mulberry32(seed);
    for (const r of relays) this.stores.set(r, new Map());
  }

  async publish(note: Note): Promise<{ relay: string; ok: boolean }[]> {
    const out: { relay: string; ok: boolean }[] = [];
    for (const [relay, store] of this.stores) {
      if (this.down.has(relay)) { out.push({ relay, ok: false }); continue; }
      // A dropped note is acknowledged but never stored.
      if (!(this.rng() < this.dropRate)) store.set(note.id, structuredClone(note));
      out.push({ relay, ok: true });
    }
    return out;
  }

  async fetch(
    tags: string[], since: number,
  ): Promise<{ notes: Note[]; relays: { relay: string; ok: boolean }[] }> {
    const up = [...this.stores].filter(([relay]) => !this.down.has(relay));
    if (up.length === 0) throw new Error("ningún relay responde");
    const want = new Set(tags);
    const out: Note[] = [];
    for (const [, store] of up) {
      for (const n of store.values()) {
        if (n.createdAt < since || !n.tags.some((t) => want.has(t))) continue;
        out.push(structuredClone(n));
        if (this.rng() < this.dupRate) out.push(structuredClone(n));
      }
    }
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    const relays = [...this.stores.keys()].map((relay) => ({ relay, ok: !this.down.has(relay) }));
    return { notes: out, relays };
  }

  /** Simulates retention: drops notes published before `olderThan` on every relay. */
  expire(olderThan: number): void {
    for (const store of this.stores.values()) {
      for (const [id, n] of store) if (n.createdAt < olderThan) store.delete(id);
    }
  }
}
