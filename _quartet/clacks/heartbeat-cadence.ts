// WI-1602 — adaptive heartbeat-write cadence: the decision half of the L0 heartbeat
// mechanism `library/heartbeat-contract.md` defines. That doc owns the heartbeat.json
// FILE FORMAT (session_id/pid/last_alive/window_resets_at) and its 2-minute write cadence;
// this module owns only "how long until the NEXT write" given the lane's liveness signals.
// Pure decision logic, no I/O — the heartbeat WRITER (WI-1615, blocked) reads/writes the
// actual files and calls into this module each tick. Does not redefine the heartbeat
// contract's schema or its base cadence: `DEFAULT_CADENCE_CONFIG.baseMs` reuses
// `clacks/lease.ts`'s `HEARTBEAT_MS` (~2min, the same base-cadence shape review-watcher.ts
// already runs on) rather than inventing a second constant for the same interval.
//
// Curve: base -> 2x -> 4x, capped at 4x (config-driven — see `backoffMultipliers` below).
// Reading note: "base" is the ACTIVE cadence (multiplier 1); the first tick that observes
// idleness already escalates to 2x — by the time `isIdle` first flips true, a full
// `idleWindowMs` of quiet has already elapsed (see `isIdle`'s bootstrap case below), so
// that tick is already reporting on idleness that has existed for one base-period. Base
// itself is not a distinct *idle* rung on the curve.
//
// Snap-back is EDGE-triggered, not window-triggered: it compares `signals.lastActivityAt`
// against the value observed at the previous tick, not against `now`. A window-vs-`now`
// check would go blind exactly when it matters most — once backed off to 4x (an 8-minute
// sleep against a 2-minute `idleWindowMs`), a single activity event landing early in that
// sleep ages out of the window before the writer's next tick ever looks, so a fixed-window
// check would miss it and stay backed off. Comparing against "what did I see last time"
// instead catches any activity that happened during the sleep, regardless of how long the
// sleep was.

import { HEARTBEAT_MS } from './lease';

export interface CadenceConfig {
  /** Interval (ms) while the lane is active. Defaults to lease.ts's HEARTBEAT_MS. */
  baseMs: number;
  /**
   * Backoff steps, applied in escalation order while idle. First entry MUST be `1`
   * (the base rate); the last entry is the cap. Default `[1, 2, 4]` (base -> 2x -> 4x).
   */
  backoffMultipliers: number[];
  /**
   * Freshness window (ms) used only to judge a lastActivityAt seen for the very first
   * time (no prior observation to diff against — e.g. cold start / writer restart), per
   * the heartbeat-contract's idle predicate ("no recent Clacks traffic in a window").
   * Defaults to `baseMs`.
   */
  idleWindowMs: number;
}

export const DEFAULT_CADENCE_CONFIG: CadenceConfig = {
  baseMs: HEARTBEAT_MS,
  backoffMultipliers: [1, 2, 4],
  idleWindowMs: HEARTBEAT_MS,
};

/**
 * The liveness signals this module reads — a projection of state the writer already has
 * (in-flight Cosmo Work Items, Clacks channel traffic, Stage transitions, wake/resume),
 * not a rival schema for the heartbeat.json file itself.
 */
export interface LivenessSignals {
  /** true if the lane has at least one Work Item in flight (e.g. Stage=Executing). */
  hasInFlightWork: boolean;
  /** ISO-8601 UTC timestamp of the most recent Clacks line / Stage transition / wake-resume, or null if none observed. */
  lastActivityAt: string | null;
  /** true if the lane carries an explicit blocked/paused marker (unresolved `blocked` outbox line, or a declared pause/hold). */
  explicitBlockedOrPaused: boolean;
}

/** Cadence state threaded from one decision tick to the next. */
export interface CadenceState {
  /** The interval (ms) this tick decided on. */
  intervalMs: number;
  /** The `lastActivityAt` this tick observed — feed back in as `previous` on the next call. */
  observedActivityAt: string | null;
}

/**
 * Idle predicate (heartbeat-contract AC3): no in-flight work AND no new Clacks traffic
 * since the last observation, OR an explicit blocked/paused marker — either condition
 * alone is sufficient. An explicit marker overrides even fresh traffic (the pause
 * announcement itself is often the most recent line).
 *
 * `previousObservedActivityAt` is the `lastActivityAt` value seen at the prior tick (or
 * `null` on the very first tick / a cold start). Activity counts as "new" only if it is
 * strictly newer than that baseline — this is what makes snap-back edge-triggered instead
 * of window-triggered (see file header).
 */
export function isIdle(
  signals: LivenessSignals,
  previousObservedActivityAt: string | null,
  now: Date,
  config: CadenceConfig = DEFAULT_CADENCE_CONFIG,
): boolean {
  if (signals.explicitBlockedOrPaused) return true;
  if (signals.hasInFlightWork) return false;
  if (!signals.lastActivityAt) return true; // never seen activity at all

  const lastActivity = Date.parse(signals.lastActivityAt);
  if (Number.isNaN(lastActivity)) return true;

  if (!previousObservedActivityAt) {
    // Cold start / writer restart — no baseline to diff against yet. Fall back to a
    // window-vs-now freshness check so a stale inherited timestamp doesn't read as active.
    return now.getTime() - lastActivity >= config.idleWindowMs;
  }

  const previousActivity = Date.parse(previousObservedActivityAt);
  const advanced =
    !Number.isNaN(previousActivity) && lastActivity > previousActivity;
  return !advanced;
}

/**
 * The cadence step (AC2/AC3/AC4). Not idle -> base, immediately, no matter how far
 * backed off `previousIntervalMs` was — this is the activity snap-back. Idle -> escalate
 * one step along `config.backoffMultipliers`, capped at the last entry. Pure function of
 * the previous interval + current idle signal; carries no wall-clock state of its own.
 */
export function nextInterval(
  idle: boolean,
  previousIntervalMs: number,
  config: CadenceConfig = DEFAULT_CADENCE_CONFIG,
): number {
  const { baseMs, backoffMultipliers } = config;
  if (!idle) return baseMs;
  const currentIndex = backoffMultipliers.findIndex(
    (m) => m * baseMs === previousIntervalMs,
  );
  const nextIndex = Math.min(currentIndex + 1, backoffMultipliers.length - 1);
  return backoffMultipliers[nextIndex] * baseMs;
}

/**
 * AC1 entry point: given the lane's liveness signals and the state from the previous
 * tick, returns the next heartbeat-write interval plus the state to thread into the
 * following call. Always a positive, config-derived interval — a backed-off tick is
 * still a valid interval to write a valid heartbeat on (AC5), just a longer one.
 *
 * `previous` is `null` on the first call (defaults to "active, no activity observed yet").
 */
export function nextHeartbeatInterval(
  signals: LivenessSignals,
  previous: CadenceState | null,
  now: Date,
  config: CadenceConfig = DEFAULT_CADENCE_CONFIG,
): CadenceState {
  const previousIntervalMs = previous?.intervalMs ?? config.baseMs;
  const previousObservedActivityAt = previous?.observedActivityAt ?? null;
  const idle = isIdle(signals, previousObservedActivityAt, now, config);
  const intervalMs = nextInterval(idle, previousIntervalMs, config);
  return { intervalMs, observedActivityAt: signals.lastActivityAt };
}
