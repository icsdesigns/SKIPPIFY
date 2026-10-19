import { eventHash, orderKey, type LhEvent } from "./event.js";
import { comparePlaced } from "./position.js";

export type RecEntry = { id: string; data: unknown; removed: boolean; author: string; hlc: string;
  /** eventHash of the winning add; breaks exact orderKey ties. */
  hash: string };
export type ListEntry = {
  id: string; data?: unknown; pos?: string; posKey?: string; removed: boolean;
  /** orderKey of the insert that supplied `data`; undefined until an insert arrives. */
  dataKey?: string;
  dataHash?: string;
  /** eventHash of the event that supplied `pos`; breaks exact posKey ties. */
  posHash?: string;
};
export type DataState = {
  records: Map<string, Map<string, RecEntry>>;
  lists: Map<string, Map<string, ListEntry>>;
};

export function emptyState(): DataState {
  return { records: new Map(), lists: new Map() };
}

function coll<T>(m: Map<string, Map<string, T>>, name: string): Map<string, T> {
  let c = m.get(name);
  if (!c) m.set(name, (c = new Map()));
  return c;
}

// A record entry created by a tombstone alone has hlc "" (no add seen yet).
function recEntry(c: Map<string, RecEntry>, id: string): RecEntry {
  let r = c.get(id);
  if (!r) c.set(id, (r = { id, data: undefined, removed: false, author: "", hlc: "", hash: "" }));
  return r;
}

function listEntry(c: Map<string, ListEntry>, id: string): ListEntry {
  let l = c.get(id);
  if (!l) c.set(id, (l = { id, removed: false }));
  return l;
}

// Exact orderKey ties (same author, same hlc) are broken by eventHash, lower wins.
function setPos(l: ListEntry, pos: string, key: string, hash: string): void {
  if (
    l.posKey === undefined || key > l.posKey ||
    (key === l.posKey && hash < (l.posHash as string))
  ) {
    l.pos = pos;
    l.posKey = key;
    l.posHash = hash;
  }
}

export function applyData(s: DataState, e: LhEvent): void {
  if (e.coll === undefined) return;
  const body = e.body as { id: string; data?: unknown; pos?: string };
  const key = orderKey(e);
  const hash = eventHash(e);
  switch (e.type) {
    case "rec.add": {
      const r = recEntry(coll(s.records, e.coll), body.id);
      if (r.hlc === "" || key < orderKey(r) || (key === orderKey(r) && hash < r.hash)) {
        r.data = body.data;
        r.author = e.author;
        r.hlc = e.hlc;
        r.hash = hash;
      }
      break;
    }
    case "rec.remove":
      recEntry(coll(s.records, e.coll), body.id).removed = true;
      break;
    case "list.insert": {
      const l = listEntry(coll(s.lists, e.coll), body.id);
      if (
        l.dataKey === undefined || key < l.dataKey ||
        (key === l.dataKey && hash < (l.dataHash as string))
      ) {
        l.data = body.data;
        l.dataKey = key;
        l.dataHash = hash;
      }
      setPos(l, body.pos as string, key, hash);
      break;
    }
    case "list.move":
      setPos(listEntry(coll(s.lists, e.coll), body.id), body.pos as string, key, hash);
      break;
    case "list.remove":
      listEntry(coll(s.lists, e.coll), body.id).removed = true;
      break;
  }
}

export function recordItems(s: DataState, name: string): RecEntry[] {
  const c = s.records.get(name);
  if (!c) return [];
  return [...c.values()]
    .filter((r) => !r.removed && r.hlc !== "")
    .sort((a, b) => {
      const ka = orderKey(a), kb = orderKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map((r) => ({ ...r, data: structuredClone(r.data) })); // a caller must never alias the state
}

export function listItems(s: DataState, name: string): { id: string; data: unknown }[] {
  const c = s.lists.get(name);
  if (!c) return [];
  return [...c.values()]
    .filter((l) => !l.removed && l.dataKey !== undefined && l.pos !== undefined)
    .sort((a, b) => comparePlaced({ id: a.id, pos: a.pos! }, { id: b.id, pos: b.pos! }))
    .map((l) => ({ id: l.id, data: structuredClone(l.data) }));
}

const byKey = <T>(a: [string, T], b: [string, T]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

function dump<T>(m: Map<string, Map<string, T>>): [string, [string, T][]][] {
  return [...m.entries()].sort(byKey).map(([n, c]) => [n, [...c.entries()].sort(byKey)]);
}

export function serializeState(s: DataState): unknown {
  return { records: dump(s.records), lists: dump(s.lists) };
}

function load<T>(x: [string, [string, T][]][]): Map<string, Map<string, T>> {
  return new Map(x.map(([n, c]) => [n, new Map(c)]));
}

export function deserializeState(x: unknown): DataState {
  const o = x as {
    records: [string, [string, RecEntry][]][];
    lists: [string, [string, ListEntry][]][];
  };
  return { records: load(o.records), lists: load(o.lists) };
}
