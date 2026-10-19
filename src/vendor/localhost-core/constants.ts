const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const INVITE_TTL_MS = DAY;
export const FUTURE_QUARANTINE_MS = DAY;
export const PREV_EPOCH_LISTEN_MS = 30 * DAY;
export const HAVE_INTERVAL_MS = HOUR;
export const REPUBLISH_MAX_DELAY_MS = 60_000;
export const MIN_RELAY_ACKS = 2;
export const BACKOFF_MS = [1, 2, 4, 8, 16, 30].map((m) => m * MINUTE);
export const ADMIN_SNAPSHOT_INTERVAL_MS = 7 * DAY;
export const LOCAL_CHECKPOINT_EVERY = 500;
export const MAX_NOTE_BYTES = 32768;
export const FETCH_MARGIN_MS = 10 * MINUTE;
export const NOTE_EXPIRATION_MS = 60 * DAY;
