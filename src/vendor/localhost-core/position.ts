import { generateKeyBetween } from "fractional-indexing";

export type Placed = { id: string; pos: string };

export function comparePlaced(a: Placed, b: Placed): number {
  if (a.pos !== b.pos) return a.pos < b.pos ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Position for a new item given `sorted` (ordered by comparePlaced).
 * No anchor, or an anchor not in `sorted`, appends at the end; if both
 * `after` and `before` are given, `after` wins. When neighbours share the
 * anchor's pos (concurrent inserts), the new key is placed beyond the whole
 * tied run, since fractional keys cannot separate equal positions.
 */
export function positionFor(
  sorted: Placed[],
  at?: { after?: string; before?: string },
): string {
  if (at?.after !== undefined) {
    const i = sorted.findIndex((p) => p.id === at.after);
    if (i >= 0) {
      const lo = sorted[i]!.pos;
      const next = sorted.slice(i + 1).find((p) => p.pos > lo);
      return generateKeyBetween(lo, next ? next.pos : null);
    }
  } else if (at?.before !== undefined) {
    const i = sorted.findIndex((p) => p.id === at.before);
    if (i >= 0) {
      const hi = sorted[i]!.pos;
      let prev: Placed | undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (sorted[j]!.pos < hi) { prev = sorted[j]; break; }
      }
      return generateKeyBetween(prev ? prev.pos : null, hi);
    }
  }
  const last = sorted[sorted.length - 1];
  return generateKeyBetween(last ? last.pos : null, null);
}
