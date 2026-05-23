import { createHash } from "node:crypto";

const MAX_SUBMISSIONS_PER_MINUTE = 5;
const RATE_LIMIT_WINDOW_MS = 1000 * 60;
const DUPLICATE_BLOCK_WINDOW_MS = 1000 * 20;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 5;

/**
 * Storage abstraction for rate-limit and duplicate-fingerprint state.
 *
 * The default implementation is an in-process Map (`createInMemoryStore`
 * below). This is correct ONLY when the API runs as a single replica:
 *
 *   • Restart loses state (acceptable — the 1-min/20-sec windows are
 *     short enough that a hot restart briefly opens a window but is not
 *     exploitable beyond a few extra submits).
 *   • Multi-instance deploys share no state, so an attacker can defeat
 *     the limit by spreading requests across replicas (round-robin LB
 *     → 5 submits/min/replica × N replicas).
 *
 * For multi-instance production, swap the store via
 * `setSubmissionGuardStore(...)` at boot. A Redis-backed implementation
 * is a ~30-line adapter (atomic INCR + EXPIRE for the rate limit,
 * SET NX + PX for the dedupe fingerprint). The interface intentionally
 * matches what a Redis adapter needs so the swap is mechanical, not
 * design work.
 *
 * If you ARE running multi-instance today and haven't swapped this out,
 * the rate-limit and duplicate-fingerprint guards are effectively
 * decorative. Treat that as a deploy bug and override at startup.
 */
export interface SubmissionGuardStore {
  getRateWindow(key: string): number[];
  setRateWindow(key: string, timestamps: number[]): void;
  getFingerprintTimestamp(fingerprint: string): number | undefined;
  setFingerprintTimestamp(fingerprint: string, timestamp: number): void;
  // Optional housekeeping — only the in-memory impl actually uses it
  // (Redis adapters lean on EXPIRE / TTL instead of manual sweeps).
  cleanup?(now: number): void;
}

function createInMemoryStore(): SubmissionGuardStore {
  const rateLimitMap = new Map<string, number[]>();
  const duplicateSubmissionMap = new Map<string, number>();
  return {
    getRateWindow(key) {
      return rateLimitMap.get(key) ?? [];
    },
    setRateWindow(key, timestamps) {
      if (timestamps.length === 0) rateLimitMap.delete(key);
      else rateLimitMap.set(key, timestamps);
    },
    getFingerprintTimestamp(fingerprint) {
      return duplicateSubmissionMap.get(fingerprint);
    },
    setFingerprintTimestamp(fingerprint, timestamp) {
      duplicateSubmissionMap.set(fingerprint, timestamp);
    },
    cleanup(now) {
      for (const [key, timestamps] of rateLimitMap.entries()) {
        const active = timestamps.filter((ts) => now - ts <= RATE_LIMIT_WINDOW_MS);
        if (active.length === 0) rateLimitMap.delete(key);
        else rateLimitMap.set(key, active);
      }
      for (const [fingerprint, timestamp] of duplicateSubmissionMap.entries()) {
        if (now - timestamp > DUPLICATE_BLOCK_WINDOW_MS) {
          duplicateSubmissionMap.delete(fingerprint);
        }
      }
    },
  };
}

let activeStore: SubmissionGuardStore = createInMemoryStore();

/**
 * Override the store at boot. Production multi-instance deployments
 * MUST call this before the server starts accepting traffic. Calling
 * it after requests have flowed will lose any state already in the
 * default in-memory store — this is intentional, since mixing two
 * stores' views of "who's been submitting" is worse than starting
 * fresh on a single shared one.
 */
export function setSubmissionGuardStore(store: SubmissionGuardStore): void {
  activeStore = store;
}

// Loud, one-shot warning at module load. Lives outside the store so it
// fires regardless of whether anything is overridden. This is the
// production canary — if you boot a multi-instance deploy with the
// default in-memory store, the logs will tell you it's broken.
// Compared as `string` because the project uses `"prod"` (apps/api env)
// while @types/node narrows NODE_ENV to `"development" | "production" |
// "test"` — both spellings should trigger the warning.
{
  const nodeEnv = String(process.env.NODE_ENV ?? "");
  if (nodeEnv === "prod" || nodeEnv === "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "[submission-guard] Using in-memory rate-limit + dedupe store. " +
        "Single-instance only — for multi-replica deploys, call " +
        "setSubmissionGuardStore() with a shared backend (Redis, etc.) " +
        "before serving traffic.",
    );
  }
}

let lastCleanupAt = 0;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  activeStore.cleanup?.(now);
}

export function checkSubmissionRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  cleanup();
  const now = Date.now();
  const previous = activeStore.getRateWindow(key);
  const active = previous.filter((timestamp) => now - timestamp <= RATE_LIMIT_WINDOW_MS);

  if (active.length >= MAX_SUBMISSIONS_PER_MINUTE) {
    const oldestActive = active[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldestActive)) / 1000));
    activeStore.setRateWindow(key, active);
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  active.push(now);
  activeStore.setRateWindow(key, active);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Two-phase duplicate-submission guard.
 *
 *   phase 1: `wasRecentlySubmitted(payload)` — read-only probe used BEFORE
 *            the DB insert. Returns true if we've seen this exact payload
 *            in the last 20s. Never mutates the map.
 *   phase 2: `recordSubmittedFingerprint(payload)` — write-only marker
 *            called AFTER a successful DB insert. Adds the fingerprint to
 *            the dedupe map so the next attempt is blocked.
 *
 * Previously these two were collapsed into a single `isDuplicateSubmission`
 * call that recorded the fingerprint regardless of whether the insert
 * actually succeeded. That meant a transient DB failure (or a downstream
 * validation throw between the duplicate check and the insert) would
 * lock the same legitimate user out for 20s when they retried — the
 * fingerprint was already in the map even though no row was persisted.
 * Splitting the phases lets us record only on success.
 */
function fingerprint(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function wasRecentlySubmitted(payload: unknown): boolean {
  cleanup();
  const now = Date.now();
  const previousTimestamp = activeStore.getFingerprintTimestamp(fingerprint(payload));
  return (
    previousTimestamp !== undefined &&
    now - previousTimestamp <= DUPLICATE_BLOCK_WINDOW_MS
  );
}

export function recordSubmittedFingerprint(payload: unknown): void {
  activeStore.setFingerprintTimestamp(fingerprint(payload), Date.now());
}

/**
 * @deprecated Replaced by `wasRecentlySubmitted` + `recordSubmittedFingerprint`.
 * Kept temporarily as a thin shim so older import sites compile while
 * the migration lands; behavior matches the original "check + record"
 * fused semantics so it's safe to delete once nobody calls it.
 */
export function isDuplicateSubmission(payload: unknown): boolean {
  const isDup = wasRecentlySubmitted(payload);
  if (!isDup) recordSubmittedFingerprint(payload);
  return isDup;
}
