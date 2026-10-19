import { canonicalBytes } from "./canonical.js";
import { ADMIN_SNAPSHOT_INTERVAL_MS } from "./constants.js";
import { sign, verify } from "./crypto.js";
import { verifyEvent } from "./event.js";
import type { Env, Group } from "./group.js";
import { isTooFarInFuture, parseHlc, type Clock } from "./hlc.js";
import { sealNotes, type Payload } from "./keys.js";
import { buildMembership, CONTROL_TYPES } from "./membership.js";
import { isWellFormed } from "./oplog.js";
import { deserializeState } from "./projection.js";
import { publishNow } from "./repair.js";
import type { Note, Snapshot } from "./storage.js";

export type SnapshotPayload = Extract<Payload, { kind: "snapshot" }>;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * R33: a snapshot is only usable when its signature matches `author`, every control event is
 * genuine, and those events show `author` as a device of a valid admin.
 */
export function verifySnapshot(p: SnapshotPayload, groupId: string, clock: Clock): Snapshot | null {
  try {
    const s = p.snapshot as unknown;
    if (!isObj(s) || !isObj(s.state) || !isObj(s.vector) || !Array.isArray(s.control)) return null;
    if (typeof s.hlcUntil !== "string") return null;
    if (!Object.values(s.vector).every((n) => Number.isInteger(n) && (n as number) >= 0)) return null;
    parseHlc(s.hlcUntil);
    if (isTooFarInFuture(s.hlcUntil, clock)) return null;
    if (!verify(canonicalBytes(s), p.sig, p.author)) return null;
    const snap = s as unknown as Snapshot;
    for (const e of snap.control) {
      if (!isWellFormed(e) || e.group !== groupId || !CONTROL_TYPES.has(e.type) || !verifyEvent(e)) return null;
    }
    const byAdmin = buildMembership(snap.control, groupId).members()
      .some((m) => m.admin && !m.removed && m.devices.includes(p.author));
    if (!byAdmin) return null;
    deserializeState(snap.state);
    return snap;
  } catch {
    return null;
  }
}

const untilOf = (p: SnapshotPayload): string => String((p.snapshot as { hlcUntil?: unknown }).hlcUntil);

/** Tries the newest snapshot first; the group adopts at most one (and only with an empty data log). */
export async function adoptBestSnapshot(
  group: Group, found: { p: SnapshotPayload; epoch: number | undefined }[], wasEmpty: boolean,
): Promise<void> {
  // R35: only notes sealed with the newest epoch key we hold (a removed admin cannot hold it). It may
  // still await its rotation (R47): a joiner learns the rotations from the snapshot itself.
  const current = Math.max(-1, ...Object.keys(group.heldKeyring()).map(Number));
  const newestFirst = found.filter((f) => f.epoch === current).map((f) => f.p)
    .sort((a, b) => untilOf(b).localeCompare(untilOf(a)));
  for (const p of newestFirst) if (await group.adoptSnapshot(p, wasEmpty)) return;
}

/** Admin only: publishes a signed snapshot once ADMIN_SNAPSHOT_INTERVAL_MS has passed. */
export async function maybePublishSnapshot(group: Group, env: Env): Promise<void> {
  if (group.status !== "ready" || !group.canSeal() || !group.membershipView().isAdmin(group.me.person)) return;
  const meta = env.storage.meta;
  const now = group.groupTime();
  const last = (await meta.get("lastSnapshotAt")) as number | undefined;
  if (last === undefined) { await meta.set("lastSnapshotAt", now); return; }
  if (now - last < ADMIN_SNAPSHOT_INTERVAL_MS) return;
  const epoch = group.currentEpoch();
  const key = group.keyring()[epoch];
  if (key === undefined) return;
  const snapshot = await group.snapshot();
  const sig = sign(canonicalBytes(snapshot), group.deviceKeys().secretKey);
  let notes: Note[];
  try {
    notes = sealNotes(group.id, epoch, key, { kind: "snapshot", author: group.me.device, snapshot, sig }, now);
  } catch {
    await meta.set("lastSnapshotAt", now); // R34: too big, skip until the next interval
    return;
  }
  for (const n of notes) if (!(await publishNow(group, env, n))) return; // retried next sync
  await meta.set("lastSnapshotAt", now);
}
