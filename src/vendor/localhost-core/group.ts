import { canRestore, decodeBackup, encodeBackup } from "./backup.js";
import { canonicalBytes } from "./canonical.js";
import { b64, newDeviceKeys, randomBytes, ready, sign, type DeviceKeys } from "./crypto.js";
import { INVITE_TTL_MS, LOCAL_CHECKPOINT_EVERY, NOTE_EXPIRATION_MS, DAY } from "./constants.js";
import { compareEvents, eventHash, signEvent, verifyEvent, type LhEvent } from "./event.js";
import { Hlc, parseHlc, systemClock, type Clock } from "./hlc.js";
import {
  addLinkCode, decodeInvite, decodeLinkCode, encodeInvite, encodeLinkCode, joinRequest, linkRequest,
} from "./invite.js";
import { isEpochKey, keyCheck, newEpochKey, openEnvelope, rotateEnvelopes, sealNotes, type Keyring } from "./keys.js";
import {
  buildMembership, CONTROL_TYPES, groupIdFor, type Member, type Membership,
} from "./membership.js";
import { isWellFormed, OpLog } from "./oplog.js";
import { comparePlaced, positionFor, type Placed } from "./position.js";
import {
  applyData, deserializeState, emptyState, listItems, recordItems, serializeState, type DataState, type RecEntry,
} from "./projection.js";
import type { Note, Snapshot, Storage } from "./storage.js";
import { verifySnapshot, type SnapshotPayload } from "./snapshot.js";
import { Syncer, type SyncReport } from "./sync.js";
import type { Transport } from "./transport.js";

export type Env = { storage: Storage; transport: Transport; clock?: Clock; random?: () => number };
type At = { after?: string; before?: string };

const DATA_TYPES = new Set(["rec.add", "rec.remove", "list.insert", "list.move", "list.remove"]);
/** Every meta key the library writes: a restore target must have none of them. */
const STORAGE_META_KEYS = [
  "groupId", "device", "deviceName", "person", "keyring", "status", "hlc", "baseSnapshot", "baseAuthor",
  "pendingJoin", "joinSecret", "lastSync", "served", "linkCodes", "lastHave", "lastSnapshotAt", "restoreDelivered",
  "restoreNeedSince",
];
const newId = () => b64(randomBytes(16));

type Status = "joining" | "ready" | "restoring";

export class Group {
  status: Status;
  readonly me: { device: string; person: string };
  private data: DataState = emptyState();
  private membership!: Membership;
  private readonly oplog: OpLog;
  private readonly listeners = new Set<() => void>();
  /** Subset of `ring` confirmed by this device's own view (R47); recomputed on every rebuild. */
  private usable: Keyring = {};
  /** R63: how long each waiting epoch key has been held with its valid rotation, accumulated locally. */
  private ages: Record<number, { age: number; last: number }> = {};
  private seenDirty = false;
  private chain: Promise<unknown> = Promise.resolve();
  private sinceCheckpoint = 0;
  /** Snapshot this device bootstrapped from (R33); a rebuild starts from its state. */
  private base: Snapshot | null = null;
  private baseAuthor: string | null = null;

  /** Use LocalHost.createGroup / LocalHost.openGroup. */
  constructor(
    readonly id: string, person: string, private readonly device: DeviceKeys,
    private readonly ring: Keyring, private readonly hlc: Hlc, status: Status,
    private readonly env: Env, private readonly clock: Clock,
  ) {
    this.me = { device: device.publicKey, person };
    this.status = status;
    this.oplog = new OpLog(env.storage, clock, id);
  }

  /**
   * R47: the keys this device may seal with or hand out: epoch 0 and every epoch with a valid
   * rotation in its OWN view. A key delivered ahead of its rotation waits in `heldKeyring()`.
   */
  keyring(): Keyring { return { ...this.usable }; }
  /** @internal Every key held, confirmed or not: only for opening incoming notes. */
  heldKeyring(): Keyring { return { ...this.ring }; }
  currentEpoch(): number {
    const ks = Object.keys(this.usable).map(Number);
    return ks.length === 0 ? -1 : Math.max(...ks);
  }
  /**
   * R53: the single sealing gate for data, republication and snapshots. Closed while we hold a key
   * newer than our current epoch (its rotation is still on its way: sealing now would use an older
   * key, maybe readable by expelled members) or while our own device is not a valid, non-removed
   * member in our own view, or while a known rotation is newer than our current epoch (R58).
   * Haves are exempt (R53b): see Repair.publishHave.
   */
  canSeal(): boolean {
    const cur = this.currentEpoch();
    const latest = this.membership.epochs().at(-1)?.epoch ?? 0;
    // R58: a known rotation whose key we lack (or dropped as a losing one) also closes it.
    return this.newestHeldEpoch() <= cur && latest <= cur && this.activeInOwnView();
  }
  removedInOwnView(): boolean {
    const person = this.membership.personOf(this.me.device);
    return person !== undefined && this.membership.members().some((m) => m.person === person && m.removed);
  }
  newestHeldEpoch(): number { return Math.max(-1, ...Object.keys(this.ring).map(Number)); }
  /** Our own device is a valid, non-removed member in our own view. */
  activeInOwnView(): boolean {
    const person = this.membership.personOf(this.me.device);
    const me = person === undefined ? undefined : this.membership.members().find((m) => m.person === person);
    return me !== undefined && !me.removed;
  }
  /** Internal: the sync loop needs the device keys to open its inbox. */
  deviceKeys(): DeviceKeys { return this.device; }
  members(): Member[] { return this.membership.members(); }
  /** Read-only view used by the sync loop. */
  membershipView(): Membership { return this.membership; }

  private syncer?: Syncer;
  private syncerOf(): Syncer { return (this.syncer ??= new Syncer(this, this.env)); }
  sync(): Promise<SyncReport> { return this.syncerOf().syncOnce(); }
  /** Fires due republications and publishes the outbox, without fetching. */
  tick(): Promise<void> { return this.syncerOf().tick(); }
  /** @internal diagnostic. Simulator only: the serialized data projection, comparable across devices. */
  debugState(): unknown { return serializeState(this.data); }
  /** @internal diagnostic. Simulator only: every stored event and whether this device accepts it as valid. */
  async debugLog(): Promise<{ event: LhEvent; valid: boolean }[]> {
    return (await this.oplog.all()).map((event) => ({ event, valid: this.membership.validAt(event) }));
  }
  /** Highest contiguous seq per author (counting from the base snapshot, if any). */
  vector(): Promise<Record<string, number>> { return this.oplog.vector(); }
  /** Consistent copy of the current state, as a snapshot (what an admin publishes). */
  snapshot(): Promise<Snapshot> { return this.locked(() => this.buildSnapshot()); }
  nextSyncDelayMs(): number { return this.syncerOf().nextDelayMs(); }
  /** max(local clock, highest HLC seen): a time base that follows the group's fastest clock. */
  groupTime(): number { return Math.max(this.clock.now(), parseHlc(this.hlc.last).ms); }

  on(ev: "change", fn: () => void): () => void {
    if (ev !== "change") throw new Error(`evento desconocido: ${ev}`);
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  records(coll: string) {
    return {
      add: async (data: unknown): Promise<string> => {
        const id = newId();
        await this.writeEvent("rec.add", { id, data }, coll);
        return id;
      },
      remove: async (id: string): Promise<void> => { await this.writeEvent("rec.remove", { id }, coll); },
      items: (): RecEntry[] => recordItems(this.data, coll),
    };
  }

  list(coll: string) {
    return {
      insert: async (data: unknown, at?: At): Promise<string> => {
        const id = newId();
        await this.writeWith("list.insert", () => ({ id, data, pos: this.posFor(coll, at) }), coll);
        return id;
      },
      move: async (id: string, at: At): Promise<void> => {
        await this.writeWith("list.move", () => ({ id, pos: this.posFor(coll, at, id) }), coll);
      },
      remove: async (id: string): Promise<void> => { await this.writeEvent("list.remove", { id }, coll); },
      items: () => listItems(this.data, coll),
    };
  }

  /** Neighbours include removed entries, so an anchor deleted since keeps its last position. */
  private posFor(coll: string, at?: At, exclude?: string): string {
    const placed: Placed[] = [...(this.data.lists.get(coll)?.values() ?? [])]
      .filter((l) => l.pos !== undefined && l.id !== exclude)
      .map((l) => ({ id: l.id, pos: l.pos! }))
      .sort(comparePlaced);
    return positionFor(placed, at);
  }

  /** Adds keys for epochs missing locally (never overwrites); a joiner with keys becomes ready. */
  adoptKeys(keys: Record<number, string>): Promise<void> {
    return this.locked(async () => {
      let added = false;
      for (const [k, v] of Object.entries(keys)) {
        if (this.ring[Number(k)] === undefined && isEpochKey(v)) { this.ring[Number(k)] = v; added = true; }
      }
      await this.saveKeys(this.confirmKeys(await this.oplog.vector()) || added);
      if (this.status === "joining" && this.currentEpoch() >= 0) {
        await this.env.storage.meta.set("status", "ready");
        this.status = "ready";
      }
    });
  }

  private requireAdmin(): void {
    if (this.status !== "ready" || !this.membership.isAdmin(this.me.person)) {
      throw new Error("solo un administrador puede hacer esto");
    }
  }

  /** Admin only. Returns the invitation code to hand to the new device. */
  async createInvite(): Promise<string> {
    this.requireAdmin();
    const inviteId = b64(randomBytes(16));
    const secret = b64(randomBytes(32));
    await this.writeEvent("invite.create", { inviteId, secret, expires: this.groupTime() + INVITE_TTL_MS });
    return encodeInvite({ group: this.id, inviteId, secret, relays: this.membership.relays() });
  }

  /** Code to link another device of the same person; its secret never leaves this device. */
  async createLinkCode(): Promise<string> {
    if (this.status !== "ready") throw new Error("el grupo aún no está listo");
    const secret = b64(randomBytes(32));
    await addLinkCode(this, this.env, secret, this.groupTime() + INVITE_TTL_MS);
    return encodeLinkCode({ group: this.id, person: this.me.person, relays: this.membership.relays(), secret });
  }

  async grantAdmin(person: string): Promise<void> {
    this.requireAdmin();
    await this.writeEvent("admin.grant", { person });
  }

  async revokeAdmin(person: string): Promise<void> {
    this.requireAdmin();
    await this.writeEvent("admin.revoke", { person });
  }

  async setRelays(relays: string[]): Promise<void> {
    this.requireAdmin();
    await this.writeEvent("relays.set", { relays });
  }

  /** Removes a person and rotates the epoch key, atomically, for the devices that remain. */
  async removePerson(person: string): Promise<void> {
    this.requireAdmin();
    const ms = this.membership;
    const target = ms.members().find((m) => m.person === person);
    if (!target || target.removed) throw new Error("persona desconocida o ya expulsada");
    if (person === this.me.person) throw new Error("no puedes expulsarte a ti mismo");
    if (ms.outranks(person, this.me.person)) throw new Error("no puedes expulsar a un administrador superior");
    const vector = await this.oplog.vector();
    const cutoff: Record<string, number> = {};
    for (const d of target.devices) cutoff[d] = vector[d] ?? 0;
    const devices = ms.members().filter((m) => !m.removed && m.person !== person).flatMap((m) => m.devices);
    await this.writeEvents([
      { type: "member.remove", body: { person, cutoff } },
      { type: "epoch.rotate", body: this.rotation(devices) },
    ]);
  }

  /** Body of an epoch.rotate to the next epoch; the new key joins the ring when it is rebuilt. */
  rotation(devices: string[]): { epoch: number; envelopes: Record<string, string>; check: string } {
    const epoch = (this.membership.epochs().at(-1)?.epoch ?? 0) + 1;
    const key = newEpochKey();
    return { epoch, envelopes: rotateEnvelopes(key, devices), check: keyCheck(this.id, epoch, key) };
  }

  /** Runs `fn` under the group's write lock (read-modify-write of meta). */
  exclusive<T>(fn: () => Promise<T>): Promise<T> { return this.locked(fn); }

  writeEvent(type: string, body: unknown, coll?: string): Promise<LhEvent> {
    return this.writeWith(type, () => body, coll);
  }

  /** `makeBody` runs inside the lock so it sees the state left by earlier writes. */
  private async writeWith(type: string, makeBody: () => unknown, coll?: string): Promise<LhEvent> {
    return (await this.writeBatch([{ type, makeBody, coll }]))[0]!;
  }

  /** Several events sealed into the same note(s): either all are stored or none. */
  writeEvents(batch: { type: string; body: unknown; coll?: string }[]): Promise<LhEvent[]> {
    return this.writeBatch(batch.map((b) => ({ type: b.type, makeBody: () => b.body, coll: b.coll })));
  }

  private writeBatch(
    batch: { type: string; makeBody: () => unknown; coll?: string }[],
  ): Promise<LhEvent[]> {
    return this.locked(async () => {
      if (this.status === "restoring" && batch.some((b) => DATA_TYPES.has(b.type))) {
        throw new Error("restaurando: sincroniza primero");
      }
      if (this.status === "joining") throw new Error("el grupo aún no está listo");
      if (batch.some((b) => DATA_TYPES.has(b.type)) && !this.canSeal()) throw new Error("sincronizando");
      const first = ((await this.oplog.vector())[this.me.device] ?? 0) + 1;
      const epoch = this.currentEpoch();
      const evs = batch.map((b, i) => {
        const e = signEvent({
          v: 1, group: this.id, author: this.me.device, seq: first + i, hlc: this.hlc.tick(), epoch,
          type: b.type, ...(b.coll !== undefined ? { coll: b.coll } : {}), body: b.makeBody(),
        }, this.device);
        if (!isWellFormed(e)) throw new Error("evento mal formado");
        return e;
      });
      // Seal first: an oversized event throws before anything is persisted.
      const notes = sealNotes(
        this.id, epoch, this.usable[epoch]!, { kind: "events", events: evs }, this.clock.now(),
      );
      // The persisted clock must never lag the stored events.
      await this.env.storage.meta.set("hlc", this.hlc.last);
      const res = await this.oplog.ingest(evs);
      for (const e of evs) {
        const h = eventHash(e);
        if (!res.added.some((x) => x.author === e.author && x.seq === e.seq && eventHash(x) === h)) {
          throw new Error("evento local no aceptado (reloj atrasado o seq en conflicto)");
        }
      }
      for (const n of notes) await this.env.storage.outbox.add(n);
      const changed = await this.integrate(res.added, res.replaced);
      if (changed) this.emit();
      return evs;
    });
  }

  receive(evs: LhEvent[]): Promise<void> {
    return this.locked(async () => {
      const res = await this.oplog.ingest(evs);
      for (const e of res.added) this.hlc.observe(e.hlc);
      if (res.added.length > 0) await this.env.storage.meta.set("hlc", this.hlc.last);
      if (await this.integrate(res.added, res.replaced)) this.emit();
    });
  }

  /**
   * R33: with no data events yet, adopts a verified admin snapshot as the base of the state.
   * Returns whether it was adopted.
   */
  adoptSnapshot(p: SnapshotPayload, wasEmpty = true): Promise<boolean> {
    return this.locked(async () => {
      if (this.status !== "ready" || !wasEmpty) return false;
      const snap = verifySnapshot(p, this.id, this.clock);
      if (!snap || (this.base && snap.hlcUntil <= this.base.hlcUntil)) return false;
      // R35: the author must be a valid admin in the FULL membership (stored control + snapshot control).
      const stored = (await this.oplog.all()).filter((e) => CONTROL_TYPES.has(e.type));
      const known = new Set(stored.map(eventHash));
      const merged = [...stored, ...snap.control.filter((e) => !known.has(eventHash(e)))].sort(compareEvents);
      const full = buildMembership(merged, this.id);
      const person = full.personOf(p.author);
      if (person === undefined || !full.isAdmin(person)) return false;
      // A snapshot covering events past a removal's cutoff would resurrect them.
      if (Object.entries(snap.vector).some(([d, n]) => full.pastCutoff(d, n))) return false;
      const res = await this.oplog.ingest(snap.control);
      for (const e of res.added) this.hlc.observe(e.hlc);
      this.hlc.observe(snap.hlcUntil);
      await this.env.storage.meta.set("hlc", this.hlc.last);
      await this.env.storage.putSnapshot(snap);
      await this.env.storage.meta.set("baseSnapshot", snap);
      await this.env.storage.meta.set("baseAuthor", p.author);
      this.base = snap;
      this.baseAuthor = p.author;
      this.oplog.setBase(snap.vector);
      await this.rebuild();
      this.emit();
      return true;
    });
  }

  /** Password-encrypted copy of everything needed to rebuild this device elsewhere. */
  exportBackup(password: string): Promise<string> {
    return this.locked(async () => encodeBackup({
      group: this.id, deviceKeys: this.device, person: this.me.person, keyring: this.keyring(),
      relays: this.membership.relays(), events: await this.oplog.all(),
      base: this.base, baseAuthor: this.baseAuthor,
    }, password));
  }

  /** Restore: loads the backup's events (and base snapshot) into an empty storage. */
  importBackup(events: LhEvent[], base: Snapshot | null, baseAuthor: string | null): Promise<void> {
    return this.locked(async () => {
      const res = await this.oplog.ingest(events);
      for (const e of res.added) this.hlc.observe(e.hlc);
      if (base) {
        this.hlc.observe(base.hlcUntil);
        await this.env.storage.putSnapshot(base);
        await this.env.storage.meta.set("baseSnapshot", base);
        await this.env.storage.meta.set("baseAuthor", baseAuthor ?? undefined);
        this.base = base;
        this.baseAuthor = baseAuthor;
        this.oplog.setBase(base.vector);
      }
      await this.env.storage.meta.set("hlc", this.hlc.last);
      await this.rebuild();
    });
  }

  /** Restore: an authenticated keyring delivery (R26) has arrived. */
  markRestoreDelivered(): Promise<void> {
    return this.locked(() => this.env.storage.meta.set("restoreDelivered", true));
  }

  /**
   * R39: a restored device may write once it holds the key of the latest rotation it knows and a
   * member delivered keys, or, after a complete sync, when nobody else is left in the group.
   */
  async finishRestore(completeSync: boolean): Promise<void> {
    if ((await this.locked(() => this.tryFinishRestore(completeSync))) !== "rotate") return;
    // R51: a lone admin whose lost device rotated after the backup: nobody can deliver that key,
    // so a fresh rotation for the devices that remain replaces it.
    const devices = this.membership.members().filter((m) => !m.removed).flatMap((m) => m.devices);
    await this.writeWith("epoch.rotate", () => this.rotation(devices));
    await this.locked(() => this.tryFinishRestore(completeSync));
  }

  private async tryFinishRestore(completeSync: boolean): Promise<"done" | "wait" | "rotate"> {
    if (this.status !== "restoring") return "done";
    const latest = this.membership.epochs().at(-1)?.epoch;
    const hasLatest = latest === undefined || this.usable[latest] !== undefined;
    const delivered = (await this.env.storage.meta.get("restoreDelivered")) === true;
    const alone = !this.membership.members().some((m) => !m.removed && m.person !== this.me.person);
    // R54: "alone" may only mean we cannot read who joined after the backup: wait for an answer first.
    const since = (await this.env.storage.meta.get("restoreNeedSince")) as number | undefined;
    const unanswered = since !== undefined && this.groupTime() - since >= INVITE_TTL_MS;
    if (alone && completeSync && !hasLatest && unanswered && this.membership.isAdmin(this.me.person)) return "rotate";
    if (!((delivered && hasLatest) || (alone && completeSync && hasLatest))) return "wait";
    await this.env.storage.meta.set("status", "ready");
    this.status = "ready";
    return "done";
  }

  /** R49: dry run, stores nothing: would `e` be a valid control event next to what we store? */
  async acceptsControl(e: LhEvent): Promise<boolean> {
    if (!isWellFormed(e) || e.group !== this.id || !CONTROL_TYPES.has(e.type) || !verifyEvent(e)) return false;
    const control = (await this.oplog.all()).filter((x) => CONTROL_TYPES.has(x.type));
    return buildMembership([...control, e], this.id).validAt(e);
  }

  async hasNoData(): Promise<boolean> {
    return !(await this.oplog.all()).some((e) => DATA_TYPES.has(e.type));
  }

  /** Rebuilds membership and data state from everything in storage. */
  async load(): Promise<void> {
    this.base = ((await this.env.storage.meta.get("baseSnapshot")) as Snapshot | undefined) ?? null;
    this.baseAuthor = ((await this.env.storage.meta.get("baseAuthor")) as string | undefined) ?? null;
    this.oplog.setBase(this.base?.vector);
    this.ages = ((await this.env.storage.meta.get("keyAge")) as typeof this.ages | undefined) ?? {};
    await this.rebuild();
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private emit(): void {
    for (const fn of [...this.listeners]) {
      try { fn(); } catch { /* a listener must never break the library */ }
    }
  }

  private async integrate(added: LhEvent[], replaced: LhEvent[]): Promise<boolean> {
    if (added.length === 0 && replaced.length === 0) return false;
    let changed = false;
    if (replaced.length > 0 || added.some((e) => CONTROL_TYPES.has(e.type))) {
      await this.rebuild();
      changed = true;
    } else {
      for (const e of added) {
        if (DATA_TYPES.has(e.type) && this.membership.validAt(e)) {
          applyData(this.data, e);
          changed = true;
        }
      }
      // R55: a held key may have been waiting for exactly these events to make the vector contiguous.
      if (Object.keys(this.ring).length > Object.keys(this.usable).length) {
        await this.saveKeys(this.confirmKeys(await this.oplog.vector()));
      }
    }
    this.sinceCheckpoint += added.length;
    if (this.sinceCheckpoint >= LOCAL_CHECKPOINT_EVERY) {
      try { await this.checkpoint(); } catch { /* a failed checkpoint must not fail the write */ }
    }
    return changed;
  }

  private async rebuild(): Promise<void> {
    const all = (await this.oplog.all()).sort(compareEvents);
    this.membership = buildMembership(all.filter((e) => CONTROL_TYPES.has(e.type)), this.id);
    // R35: a base whose author has since been removed is no longer trusted.
    // Nor is one that covers events now invalid: its author snapshotted before learning of a removal.
    if (this.base && this.baseAuthor !== null) {
      const person = this.membership.personOf(this.baseAuthor);
      const ms = this.membership;
      if ((person !== undefined && ms.members().some((m) => m.person === person && m.removed))
        || Object.entries(this.base.vector).some(([d, n]) => ms.pastCutoff(d, n))) {
        this.base = null;
        this.baseAuthor = null;
        this.oplog.setBase(undefined);
        await this.env.storage.meta.set("baseSnapshot", undefined);
        await this.env.storage.meta.set("baseAuthor", undefined);
      }
    }
    // A valid rotation's envelope for this device wins over any local key for that epoch
    // (it resolves a concurrent rotation we lost); the only path that overwrites keys.
    let rekeyed = false;
    for (const r of this.membership.epochs()) {
      const sealed = r.envelopes[this.me.device];
      const key = sealed === undefined ? null : openEnvelope(sealed, this.device);
      if (key !== null && this.ring[r.epoch] !== key) { this.ring[r.epoch] = key; delete this.ages[r.epoch]; this.seenDirty = true; rekeyed = true; }
    }
    await this.saveKeys(this.confirmKeys(await this.oplog.vector()) || rekeyed);
    this.data = this.base ? deserializeState(this.base.state) : emptyState();
    for (const e of all) this.hlc.observe(e.hlc);
    for (const e of all) {
      if (DATA_TYPES.has(e.type) && this.membership.validAt(e)) applyData(this.data, e);
    }
  }

  /** The entries of `keys` that match the check of a valid rotation in our own view (R50). */
  provenKeys(keys: Record<number, string>): Keyring {
    const out: Keyring = {};
    if (this.removedInOwnView()) return out; // R61: nothing to adopt once we are out
    for (const r of this.membership.epochs()) {
      const k = keys[r.epoch];
      if (isEpochKey(k) && keyCheck(this.id, r.epoch, k) === r.check) out[r.epoch] = k;
    }
    return out;
  }

  /**
   * R47/R50: a key is usable for epoch 0, or for an epoch whose valid rotation in our own view
   * carries its check. A key that fails that check belongs to a losing rotation: it is dropped
   * (publishNeed then asks for the right one). R55: a matching key becomes usable only once our
   * contiguous vector for the rotation's author reaches it, so everything that author wrote before
   * (the member.remove of the same batch, even if it travelled in another note) is known.
   * Returns whether the ring changed.
   */
  private confirmKeys(vector: Record<string, number>): boolean {
    const rotations = new Map(this.membership.epochs().map((r) => [r.epoch, r]));
    let dropped = false;
    this.usable = {};
    for (const [k, v] of Object.entries(this.ring)) {
      const epoch = Number(k);
      const r = rotations.get(epoch);
      if (!isEpochKey(v)) { delete this.ring[epoch]; this.dropAge(epoch); dropped = true; continue; } // R59
      if (epoch === 0) { this.usable[epoch] = v; continue; }
      if (r === undefined) continue; // still awaiting its rotation
      if (keyCheck(this.id, epoch, v) !== r.check) { delete this.ring[epoch]; this.dropAge(epoch); dropped = true; continue; }
      if ((vector[r.author] ?? 0) >= r.seq) { this.usable[epoch] = v; this.dropAge(epoch); continue; }
      // R60/R62/R63: a key waiting for longer than NOTE_EXPIRATION_MS no longer waits for its author's
      // earlier events (if one is lost on every device, writes would otherwise stop forever). Age is
      // accumulated from raw LOCAL clock readings, each step capped at one day, so neither a skewed HLC
      // nor a forward clock jump can age a key.
      const now = this.clock.now();
      const a = this.ages[epoch] ?? { age: 0, last: now };
      a.age += Math.min(Math.max(0, now - a.last), DAY);
      a.last = now;
      this.ages[epoch] = a;
      this.seenDirty = true;
      if (a.age > NOTE_EXPIRATION_MS) this.usable[epoch] = v;
    }
    return dropped;
  }

  /** R60: the passage of time alone can unlock a waiting key; called on every sync and tick. */
  reconfirmKeys(): Promise<void> {
    if (Object.keys(this.ring).length <= Object.keys(this.usable).length) return Promise.resolve();
    return this.locked(async () => {
      await this.saveKeys(this.confirmKeys(await this.oplog.vector()));
    });
  }

  private dropAge(epoch: number): void {
    if (this.ages[epoch] !== undefined) { delete this.ages[epoch]; this.seenDirty = true; }
  }

  private async saveKeys(ringChanged: boolean): Promise<void> {
    if (ringChanged) await this.env.storage.meta.set("keyring", this.ring);
    if (this.seenDirty) { this.seenDirty = false; await this.env.storage.meta.set("keyAge", this.ages); }
  }

  private async buildSnapshot(): Promise<Snapshot> {
    const all = await this.oplog.all();
    return {
      state: serializeState(this.data),
      vector: await this.oplog.vector(),
      hlcUntil: this.hlc.last,
      control: all.filter((e) => CONTROL_TYPES.has(e.type) && this.membership.validAt(e)),
    };
  }

  private async checkpoint(): Promise<void> {
    await this.env.storage.putSnapshot(await this.buildSnapshot());
    this.sinceCheckpoint = 0;
  }
}

export class LocalHost {
  static async createGroup(
    env: Env, opts: { name: string; relays: string[]; deviceName: string },
  ): Promise<Group> {
    await ready();
    const m = env.storage.meta;
    if ((await m.get("groupId")) !== undefined || (await m.get("device")) !== undefined) {
      throw new Error("este almacenamiento ya contiene un grupo");
    }
    const clock = env.clock ?? systemClock;
    const device = newDeviceKeys();
    const nonce = b64(randomBytes(32));
    const id = groupIdFor(device.publicKey, nonce);
    const ring: Keyring = { 0: newEpochKey() };
    const g = new Group(id, device.publicKey, device, ring, new Hlc(clock), "ready", env, clock);
    await g.load();
    await g.writeEvent("group.create", { name: opts.name, relays: opts.relays, nonce });
    // Identity goes last: a failed creation never leaves keys without events.
    await m.set("device", device);
    await m.set("deviceName", opts.deviceName);
    await m.set("person", device.publicKey);
    await m.set("keyring", ring);
    await m.set("status", "ready");
    await m.set("groupId", id);
    return g;
  }

  /** Joins with an invitation code; the group becomes ready once a member answers. */
  static async joinGroup(env: Env, invite: string, deviceName: string): Promise<Group> {
    await ready();
    const inv = decodeInvite(invite);
    return LocalHost.startJoin(env, inv.group, deviceName, undefined, (keys, now) =>
      joinRequest(inv, keys, deviceName, now), inv.secret);
  }

  /** Links a new device to an existing person with a code from `Group.createLinkCode`. */
  static async linkDevice(env: Env, code: string, deviceName: string): Promise<Group> {
    await ready();
    const c = decodeLinkCode(code);
    return LocalHost.startJoin(env, c.group, deviceName, c.person, (keys, now) =>
      linkRequest(c, keys, deviceName, now), c.secret);
  }

  private static async startJoin(
    env: Env, groupId: string, deviceName: string, person: string | undefined,
    makeRequest: (keys: DeviceKeys, now: number) => Note, secret: string,
  ): Promise<Group> {
    await ready();
    const m = env.storage.meta;
    if ((await m.get("groupId")) !== undefined || (await m.get("device")) !== undefined) {
      throw new Error("este almacenamiento ya contiene un grupo");
    }
    const clock = env.clock ?? systemClock;
    const device = newDeviceKeys();
    const owner = person ?? device.publicKey;
    await m.set("pendingJoin", makeRequest(device, clock.now()));
    await m.set("joinSecret", secret);
    await m.set("device", device);
    await m.set("deviceName", deviceName);
    await m.set("person", owner);
    await m.set("keyring", {});
    await m.set("status", "joining");
    await m.set("groupId", groupId);
    const g = new Group(groupId, owner, device, {}, new Hlc(clock), "joining", env, clock);
    await g.load();
    return g;
  }

  /**
   * Restores a backup into an empty storage as a NEW device of the same person. The old device
   * never signs an event: its key only certifies the new one in memory (device.link, form b),
   * so nothing it published after the backup can be contradicted.
   */
  static async restore(env: Env, backup: string, password: string, deviceName: string): Promise<Group> {
    await ready();
    const b = decodeBackup(backup, password); // before touching the storage
    const m = env.storage.meta;
    // R40: only a pristine storage; there is no delete API to undo a half-done restore.
    const st = env.storage;
    for (const k of STORAGE_META_KEYS) {
      if ((await m.get(k)) !== undefined) throw new Error("este almacenamiento ya contiene un grupo");
    }
    if ((await st.getEvents({})).length > 0 || (await st.outbox.list()).length > 0
      || (await st.latestSnapshot()) !== null) throw new Error("este almacenamiento ya contiene un grupo");
    const clock = env.clock ?? systemClock;
    const device = newDeviceKeys();
    const cert = sign(
      canonicalBytes({ group: b.group, person: b.person, device: device.publicKey }), b.deviceKeys.secretKey,
    );
    // Validate fully in memory before persisting anything.
    if (!canRestore(b, device, cert, clock)) throw new Error("copia no válida");
    const ring: Keyring = Object.fromEntries(Object.entries(b.keyring).filter(([, v]) => isEpochKey(v))); // R59
    const g = new Group(b.group, b.person, device, ring, new Hlc(clock), "restoring", env, clock);
    await g.importBackup(b.events, b.base, b.baseAuthor);
    const link = await g.writeEvent("device.link", { device: device.publicKey, person: b.person, cert });
    if (!g.membershipView().validAt(link)) throw new Error("copia no válida");
    // Identity goes last: a failed restore never leaves keys without events.
    await m.set("device", device);
    await m.set("deviceName", deviceName);
    await m.set("person", b.person);
    await m.set("keyring", ring);
    await m.set("status", "restoring");
    await m.set("groupId", b.group);
    await g.finishRestore(false);
    return g;
  }

  static async openGroup(env: Env): Promise<Group> {
    await ready();
    const clock = env.clock ?? systemClock;
    const m = env.storage.meta;
    const device = (await m.get("device")) as DeviceKeys | undefined;
    const id = (await m.get("groupId")) as string | undefined;
    const person = (await m.get("person")) as string | undefined;
    const ring = (await m.get("keyring")) as Keyring | undefined;
    if (!device || !id || !person || !ring) throw new Error("no hay grupo en este almacenamiento");
    const last = (await m.get("hlc")) as string | undefined;
    const status = ((await m.get("status")) as Status | undefined) ?? "ready";
    const g = new Group(id, person, device, ring, new Hlc(clock, last), status, env, clock);
    await g.load();
    return g;
  }
}
