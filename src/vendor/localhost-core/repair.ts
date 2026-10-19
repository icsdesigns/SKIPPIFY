import { canonicalBytes } from "./canonical.js";
import { sign, verify } from "./crypto.js";
import { FETCH_MARGIN_MS, FUTURE_QUARANTINE_MS, HAVE_INTERVAL_MS, MIN_RELAY_ACKS, REPUBLISH_MAX_DELAY_MS } from "./constants.js";
import type { LhEvent } from "./event.js";
import type { Env, Group } from "./group.js";
import { sealNotes, type Payload } from "./keys.js";
import type { Note } from "./storage.js";

type Vector = Record<string, number>;
type Plan = { due: number; at: number; events: LhEvent[]; seen: Set<string> };
type QueuedHave = { device: string; vector: Vector; at: number };
export type HavePayload = Extract<Payload, { kind: "have" }>;

const haveBody = (group: string, device: string, vector: Vector, at: number) =>
  canonicalBytes({ group, device, vector, at });

const keyOf = (e: Pick<LhEvent, "author" | "seq">) => `${e.author}:${e.seq}`;

/** Publishes straight to the relays (no outbox); true when enough relays acknowledged it. */
export async function publishNow(group: Group, env: Env, note: Note): Promise<boolean> {
  try {
    const res = await env.transport.publish({ ...note, createdAt: group.groupTime() });
    return res.length > 0 && res.filter((r) => r.ok).length >= Math.min(MIN_RELAY_ACKS, res.length);
  } catch {
    return false;
  }
}

function cleanVector(v: Vector): Vector {
  const out: Vector = {};
  for (const [k, n] of Object.entries(v)) if (Number.isInteger(n) && n >= 0) out[k] = n;
  return out;
}

const sameVector = (a: Vector, b: Vector): boolean =>
  canonicalBytes(a).toString() === canonicalBytes(b).toString();

/** "Parte" (have-vector) publication and the randomized republication of what others lack. */
export class Repair {
  private readonly haves = new Map<string, { vector: Vector; at: number }>();
  private queue: QueuedHave[] = [];
  private readonly plans = new Map<string, Plan>();
  /** (author:seq) → createdAt of the latest note that carried it during this sync. */
  private runSeen = new Map<string, number>();
  private readonly random: () => number;

  constructor(private readonly group: Group, private readonly env: Env) {
    this.random = env.random ?? Math.random;
  }

  startRun(): void {
    this.runSeen = new Map();
  }

  /** Events found inside a fetched note: another member may already have republished them. */
  noteTransit(createdAt: number, events: LhEvent[]): void {
    for (const e of events) {
      const k = keyOf(e);
      this.runSeen.set(k, Math.max(createdAt, this.runSeen.get(k) ?? 0));
      for (const p of this.plans.values()) if (createdAt >= p.at - FETCH_MARGIN_MS) p.seen.add(k);
    }
  }

  /** R36: only haves signed by their own device and not dated in the far future are kept. */
  onHave(p: HavePayload): void {
    try {
      if (!Number.isFinite(p.at) || p.at > this.group.groupTime() + FUTURE_QUARANTINE_MS) return;
      if (!verify(haveBody(this.group.id, p.device, p.vector, p.at), p.sig, p.device)) return;
    } catch { return; }
    this.queue.push({ device: p.device, vector: cleanVector(p.vector), at: p.at });
  }

  private activeMember(device: string): boolean {
    const ms = this.group.membershipView();
    const person = ms.personOf(device);
    return person !== undefined && ms.members().some((m) => m.person === person && !m.removed);
  }

  /** Stores the latest have per device and schedules a republish of what that device lacks. */
  async processHaves(): Promise<void> {
    if (this.queue.length === 0) return;
    const stored = await this.env.storage.getEvents({});
    this.queue.sort((a, b) => a.at - b.at);
    // Handled entries leave the queue one by one, so a failure never loses the rest.
    for (let h = this.queue[0]; h !== undefined; this.queue.shift(), h = this.queue[0]) {
      if (h.device === this.group.me.device || !this.activeMember(h.device)) continue;
      const cur = this.haves.get(h.device);
      if (cur && cur.at >= h.at) continue;
      this.haves.set(h.device, { vector: h.vector, at: h.at });
      const events = stored.filter((e) => e.seq > (h.vector[e.author] ?? 0));
      if (events.length === 0) { this.plans.delete(h.device); continue; }
      const at = this.group.groupTime();
      const seen = new Set<string>();
      for (const [k, t] of this.runSeen) if (t >= at - FETCH_MARGIN_MS) seen.add(k);
      this.plans.set(h.device, { due: at + this.random() * REPUBLISH_MAX_DELAY_MS, at, events, seen });
    }
  }

  /** Moves due republications into the outbox, minus what a newer have or another member covered. */
  async fireDue(): Promise<void> {
    if (!this.group.canSeal()) return; // R53: plans stay due until the gate opens
    const now = this.group.groupTime();
    const epoch = this.group.currentEpoch();
    const key = this.group.keyring()[epoch];
    for (const [device, plan] of [...this.plans]) {
      if (plan.due > now) continue;
      this.plans.delete(device);
      const have = this.haves.get(device)?.vector ?? {};
      const events = plan.events.filter((e) => e.seq > (have[e.author] ?? 0) && !plan.seen.has(keyOf(e)));
      if (events.length === 0 || key === undefined) continue;
      // An older event goes out under its own epoch (a lagging device may not hold our newest key yet
      // and learns it from the rotation inside those very events) AND under the current one (nobody
      // listens to an old epoch tag once it is more than PREV_EPOCH_LISTEN_MS behind).
      const ring = this.group.keyring();
      const byEpoch = new Map<number, LhEvent[]>();
      for (const e of events) {
        const ks = ring[e.epoch] !== undefined && e.epoch < epoch ? [e.epoch, epoch] : [epoch];
        for (const k of ks) byEpoch.set(k, [...(byEpoch.get(k) ?? []), e]);
      }
      try {
        for (const [k, evs] of byEpoch) {
          for (const n of sealNotes(this.group.id, k, ring[k]!, { kind: "events", events: evs }, now)) {
            await this.env.storage.outbox.add(n);
          }
        }
      } catch { /* an unsealable batch is simply not republished */ }
    }
  }

  /** Publishes our own have when the vector changed or HAVE_INTERVAL_MS has passed. */
  async publishHave(): Promise<void> {
    // R53: never under a key older than one we hold. While a newer key still awaits its rotation, the
    // have goes under that newest key: it carries only our vector, and without it nobody republishes
    // the rotation we are missing once the relays have dropped it.
    if (this.group.status !== "ready" || this.group.removedInOwnView()) return;
    const epoch = this.group.newestHeldEpoch(); // = currentEpoch() whenever the gate is open
    const key = this.group.heldKeyring()[epoch];
    if (key === undefined) return;
    const meta = this.env.storage.meta;
    const vector = await this.group.vector();
    const now = this.group.groupTime();
    const last = (await meta.get("lastHave")) as { vector: Vector; at: number } | undefined;
    if (last && sameVector(last.vector, vector) && now - last.at < HAVE_INTERVAL_MS) return;
    const device = this.group.me.device;
    const sig = sign(haveBody(this.group.id, device, vector, now), this.group.deviceKeys().secretKey);
    // R61: also under the current usable key when it differs: a have under a pending key that turns out
    // to belong to a losing rotation would otherwise strand this device.
    const cur = this.group.currentEpoch();
    const epochs = cur !== epoch && this.group.keyring()[cur] !== undefined ? [epoch, cur] : [epoch];
    let ok = false;
    for (const e of epochs) {
      const [note] = sealNotes(this.group.id, e, this.group.heldKeyring()[e]!, { kind: "have", device, vector, at: now, sig }, now);
      if (note && await publishNow(this.group, this.env, note)) ok = true;
    }
    if (ok) await meta.set("lastHave", { vector, at: now });
  }
}
