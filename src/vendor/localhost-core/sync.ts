import {
  BACKOFF_MS, FETCH_MARGIN_MS, MIN_RELAY_ACKS, PREV_EPOCH_LISTEN_MS, REPUBLISH_MAX_DELAY_MS,
} from "./constants.js";
import type { LhEvent } from "./event.js";
import type { Env, Group } from "./group.js";
import { parseHlc } from "./hlc.js";
import { handleInbox, handleRequests, handleNeeds, healRotation, publishNeed, requestTags, type NeedAt } from "./invite.js";
import { groupTag, inboxTag, inviteTag, needTag, openNeed, openNote } from "./keys.js";
import { Repair } from "./repair.js";
import { adoptBestSnapshot, maybePublishSnapshot, type SnapshotPayload } from "./snapshot.js";
import type { Note } from "./storage.js";

export type SyncReport = {
  received: number; published: number; pendingOutbox: number; failedRelays: string[];
};

const MAX_ROUNDS = 5;

export class Syncer {
  /** Cleared at the start of every syncOnce. */
  pending: { inbox: Note[]; invites: Note[] } = { inbox: [], invites: [] };
  private failures = 0;
  private running: Promise<SyncReport> | null = null;
  private readonly repair: Repair;

  constructor(private readonly group: Group, private readonly env: Env) {
    this.repair = new Repair(group, env);
  }

  /** Fires due republications and publishes the outbox; no fetching. */
  async tick(): Promise<void> {
    await this.running?.catch(() => undefined);
    try { await this.group.reconfirmKeys(); } catch { /* retried next time */ }
    try { await this.repair.processHaves(); } catch { /* retried next time */ }
    await this.repair.fireDue();
    await this.publishOutbox();
  }

  nextDelayMs(): number {
    if (this.failures === 0) return REPUBLISH_MAX_DELAY_MS;
    return BACKOFF_MS[Math.min(this.failures, BACKOFF_MS.length) - 1]!;
  }

  syncOnce(): Promise<SyncReport> {
    // Concurrent callers share one run.
    this.running ??= this.run().finally(() => { this.running = null; });
    return this.running;
  }

  private now(): number {
    return (this.env.clock ?? { now: () => Date.now() }).now();
  }

  private async tags(): Promise<{ tags: string[]; tagToEpoch: Map<string, number>; invites: Set<string> }> {
    const inbox = inboxTag(this.group.me.device);
    const key0 = this.group.keyring()[0];
    const extra = key0 !== undefined && this.group.status === "ready" ? [needTag(this.group.id, key0)] : [];
    // A joining device has no keys yet: it only listens to its inbox.
    if (this.group.status === "joining") return { tags: [inbox], tagToEpoch: new Map(), invites: new Set() };
    const ring = this.group.heldKeyring(); // R47: keys not yet confirmed still open incoming notes
    const ms = this.group.membershipView();
    const now = this.now();
    const current = Math.max(-1, ...Object.keys(ring).map(Number));
    const rotations = ms.epochs();
    const tagToEpoch = new Map<string, number>();
    for (const k of Object.keys(ring).map(Number)) {
      if (k !== current) {
        // Epoch k ended when the next one was installed.
        const next = rotations.filter((r) => r.epoch > k).sort((a, b) => a.epoch - b.epoch)[0];
        if (next && now - parseHlc(next.rotateHlc).ms > PREV_EPOCH_LISTEN_MS) continue;
      }
      tagToEpoch.set(groupTag(this.group.id, ring[k]!), k);
    }
    const invites = new Set(await requestTags(this.group, this.env, now));
    return { tags: [...tagToEpoch.keys(), inbox, ...extra, ...invites], tagToEpoch, invites };
  }

  /** A joining device keeps offering its request until someone answers with the keyring. */
  private async republishJoinRequest(): Promise<void> {
    if (this.group.status !== "joining") return;
    const note = (await this.env.storage.meta.get("pendingJoin")) as Note | undefined;
    if (!note) return;
    try { await this.env.transport.publish({ ...note, createdAt: this.group.groupTime() }); } catch { /* retried next sync */ }
  }

  private async run(): Promise<SyncReport> {
    const storage = this.env.storage;
    this.pending = { inbox: [], invites: [] };
    this.repair.startRun();
    const before = await sumVector(this.group.vector());
    const startedAt = this.group.groupTime();
    const lastSync = (await storage.meta.get("lastSync")) as number | undefined;
    const since = lastSync === undefined ? 0 : Math.max(0, Math.min(lastSync, startedAt) - FETCH_MARGIN_MS);
    await this.republishJoinRequest();
    const inboxTagMe = inboxTag(this.group.me.device);
    const seenInbox = new Set<string>();
    const seenInvite = new Set<string>();
    let fetched = false;
    let complete = true; // every relay answered and every batch applied
    const expected = this.group.membershipView().relays();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { tags, tagToEpoch, invites } = await this.tags();
      let notes: Note[];
      try {
        const res = await this.env.transport.fetch(tags, since);
        notes = res.notes;
        const answered = new Set(res.relays.filter((r) => r.ok).map((r) => r.relay));
        const want = expected.length > 0 ? expected : res.relays.map((r) => r.relay);
        if (!want.every((r) => answered.has(r))) complete = false;
      } catch {
        break;
      }
      fetched = true;
      const ring = this.group.heldKeyring();
      const ringSize = Object.keys(ring).length;
      const byId = new Map<string, Note>();
      for (const n of notes) byId.set(n.id, n);
      const batches: LhEvent[][] = [];
      const snapshots: { p: SnapshotPayload; epoch: number | undefined }[] = [];
      const wasEmpty = await this.group.hasNoData();
      const needs: NeedAt[] = [];
      const ring0 = ring[0];
      const needT = ring0 !== undefined && this.group.status === "ready" ? needTag(this.group.id, ring0) : "";
      const vecBefore = await sumVector(this.group.vector());
      for (const n of byId.values()) {
        if (n.tags.includes(inboxTagMe)) {
          if (!seenInbox.has(n.id)) { seenInbox.add(n.id); this.pending.inbox.push(n); }
          continue;
        }
        if (n.tags.some((t) => invites.has(t))) {
          if (!seenInvite.has(n.id)) { seenInvite.add(n.id); this.pending.invites.push(n); }
          continue;
        }
        if (needT && n.tags.includes(needT)) {
          const nd = openNeed(n, this.group.id, ring0!);
          if (nd) needs.push({ ...nd, createdAt: n.createdAt });
          continue;
        }
        const p = openNote(n, this.group.id, tagToEpoch, ring);
        if (!p) continue;
        if (p.kind === "events") { batches.push(p.events); this.repair.noteTransit(n.createdAt, p.events); }
        else if (p.kind === "have") this.repair.onHave(p);
        else snapshots.push({ p, epoch: n.tags.map((t) => tagToEpoch.get(t)).find((e) => e !== undefined) });
      }
      for (const evs of batches) {
        try { await this.group.receive(evs); } catch { complete = false; /* a bad batch must not abort the sync */ }
      }
      // After the batches, so the full membership is known (R35).
      try { await adoptBestSnapshot(this.group, snapshots, wasEmpty); } catch { complete = false; }
      try { await this.repair.processHaves(); } catch { complete = false; }
      const inboxNotes = this.pending.inbox.splice(0);
      const inviteNotes = this.pending.invites.splice(0);
      let retry: Note[] = [];
      // R62: after the fetch, so an earlier event that is still on the relays confirms by R55 first.
      try { await this.group.reconfirmKeys(); } catch { complete = false; }
      try {
        retry = await handleInbox(this.group, this.env, inboxNotes);
        await handleNeeds(this.group, this.env, needs);
        await handleRequests(this.group, this.env, inviteNotes);
        await healRotation(this.group);
      } catch { complete = false; }
      this.pending.inbox.push(...retry);
      // Deliveries that could not be judged yet are retried while new events keep arriving.
      const progressed = (await sumVector(this.group.vector())) > vecBefore;
      if (Object.keys(this.group.heldKeyring()).length === ringSize && !(retry.length > 0 && progressed)) break;
    }
    // R54: the restore need goes out first; a lone restorer only rotates once it has gone unanswered.
    if (fetched) await publishNeed(this.group, this.env);
    if (fetched) await this.group.finishRestore(complete);
    if (fetched && complete && this.group.status === "ready") await storage.meta.set("lastSync", startedAt);

    try { await this.repair.fireDue(); } catch { /* retried next sync */ }
    if (fetched) {
      try { await this.repair.publishHave(); } catch { /* retried next sync */ }
      try { await maybePublishSnapshot(this.group, this.env); } catch { /* retried next sync */ }
    }
    const { published, failed } = await this.publishOutbox();
    this.failures = fetched ? 0 : this.failures + 1;
    return {
      received: (await sumVector(this.group.vector())) - before, published,
      pendingOutbox: (await storage.outbox.list()).length, failedRelays: [...failed],
    };
  }

  private async publishOutbox(): Promise<{ published: number; failed: Set<string> }> {
    const storage = this.env.storage;
    const failed = new Set<string>();
    let published = 0;
    for (const n of await storage.outbox.list()) {
      // Relays filter `since` by publish time, so every attempt is re-stamped with group time.
      let res: { relay: string; ok: boolean }[];
      try {
        res = await this.env.transport.publish({ ...n, createdAt: this.group.groupTime() });
      } catch {
        res = this.group.membershipView().relays().map((relay) => ({ relay, ok: false }));
      }
      for (const r of res) if (!r.ok) failed.add(r.relay);
      const oks = res.filter((r) => r.ok).length;
      if (res.length > 0 && oks >= Math.min(MIN_RELAY_ACKS, res.length)) {
        await storage.outbox.ack(n.id);
        published++;
      }
    }
    return { published, failed };
  }
}

async function sumVector(v: Promise<Record<string, number>>): Promise<number> {
  return Object.values(await v).reduce((a, b) => a + b, 0);
}
