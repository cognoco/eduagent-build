/**
 * Progressive disclosure — gates complex progress UI behind a session threshold.
 *
 * "Completed session" = status !== 'active' (includes completed, paused, auto_closed).
 * This matches the definition in snapshot-aggregation.ts computeProgressMetrics().
 * // SYNC: apps/api/src/services/snapshot-aggregation.ts computeProgressMetrics()
 */

import { NEW_LEARNER_SESSION_THRESHOLD } from '@eduagent/schemas';

/**
 * Re-exported under the original name so callers within this module keep
 * a readable name. The canonical value lives in @eduagent/schemas —
 * importing from there is the single source of truth for both API and mobile.
 */
export const PROGRESSIVE_DISCLOSURE_THRESHOLD = NEW_LEARNER_SESSION_THRESHOLD;

/**
 * Returns true if the learner has fewer than THRESHOLD completed sessions.
 * `undefined` → false (unknown means don't gate — backwards compat).
 */
export function isNewLearner(totalSessions: number | undefined): boolean {
  if (totalSessions === undefined) return false;
  return totalSessions < PROGRESSIVE_DISCLOSURE_THRESHOLD;
}

/**
 * Returns how many more sessions are needed to unlock full progress UI.
 * Returns 0 if already past threshold or undefined.
 */
export function sessionsUntilFullProgress(
  totalSessions: number | undefined
): number {
  if (totalSessions === undefined) return 0;
  return Math.max(0, PROGRESSIVE_DISCLOSURE_THRESHOLD - totalSessions);
}
