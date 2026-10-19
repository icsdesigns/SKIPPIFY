import type { LhEvent } from "./event.js";

export type Note = { id: string; tags: string[]; createdAt: number; content: string };
export type Snapshot = {
  state: unknown; vector: Record<string, number>; hlcUntil: string; control: LhEvent[];
};

export interface Storage {
  putEvents(evs: LhEvent[]): Promise<void>;
  getEvents(filter: { author?: string; fromSeq?: number }): Promise<LhEvent[]>;
  getVector(): Promise<Record<string, number>>;
  putSnapshot(s: Snapshot): Promise<void>;
  latestSnapshot(): Promise<Snapshot | null>;
  outbox: { add(n: Note): Promise<void>; list(): Promise<Note[]>; ack(id: string): Promise<void> };
  meta: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void> };
}

const copy = <T>(x: T): T => structuredClone(x);

/** In-memory Storage. Deep-copies on the way in and out so callers never share references. */
export class MemoryStorage implements Storage {
  private events = new Map<string, Map<number, LhEvent>>();
  private snapshot: Snapshot | null = null;
  private notes = new Map<string, Note>();
  private metaMap = new Map<string, unknown>();

  async putEvents(evs: LhEvent[]): Promise<void> {
    for (const e of evs) {
      let a = this.events.get(e.author);
      if (!a) this.events.set(e.author, (a = new Map()));
      a.set(e.seq, copy(e));
    }
  }

  async getEvents(filter: { author?: string; fromSeq?: number }): Promise<LhEvent[]> {
    const from = filter.fromSeq ?? 0;
    const authors = filter.author !== undefined ? [filter.author] : [...this.events.keys()];
    const out: LhEvent[] = [];
    for (const au of authors) {
      const a = this.events.get(au);
      if (!a) continue;
      for (const seq of [...a.keys()].sort((x, y) => x - y)) {
        if (seq >= from) out.push(copy(a.get(seq)!));
      }
    }
    return out;
  }

  async getVector(): Promise<Record<string, number>> {
    const v: Record<string, number> = {};
    for (const [au, a] of this.events) {
      let s = 0;
      while (a.has(s + 1)) s++;
      if (s > 0) v[au] = s;
    }
    return v;
  }

  async putSnapshot(s: Snapshot): Promise<void> {
    this.snapshot = copy(s);
  }

  async latestSnapshot(): Promise<Snapshot | null> {
    return this.snapshot ? copy(this.snapshot) : null;
  }

  outbox = {
    add: async (n: Note): Promise<void> => { this.notes.set(n.id, copy(n)); },
    list: async (): Promise<Note[]> => [...this.notes.values()].map(copy),
    ack: async (id: string): Promise<void> => { this.notes.delete(id); },
  };

  meta = {
    get: async (k: string): Promise<unknown> => {
      return this.metaMap.has(k) ? copy(this.metaMap.get(k)) : undefined;
    },
    set: async (k: string, v: unknown): Promise<void> => { this.metaMap.set(k, copy(v)); },
  };
}
