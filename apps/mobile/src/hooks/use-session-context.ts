/**
 * Session-owned facade hooks.
 *
 * These hooks exist to enforce the surface-ownership rule that session and
 * session-summary screens do NOT directly import progress hooks. They
 * encapsulate the dependency on `useProgressInventory` / `useOverallProgress`
 * behind a session-domain name.
 *
 * Status: IMPORT-BOUNDARY FACADE (intentional — see deferral note below).
 *
 * --- PR 9 deferral (2026-05-26) ---
 *
 * The surface-ownership plan's PR 9 "Optional Payload-Narrow Queries" was
 * evaluated and **deferred**. The plan's decision criterion (PR 9 task list,
 * `docs/plans/2026-05-13-surface-ownership-boundaries.md`) requires either:
 *   (a) cold-cache Session/Session-Summary entry fetches > 5 KB just to read
 *       a count/boolean, OR
 *   (b) the broad query adds > 200 ms p50 user-visible latency on Session
 *       entry.
 *
 * Findings:
 *   - Criterion (a) is met on paper — `useProgressInventory()` returns a
 *     `KnowledgeInventory` whose `subjects[]` field expands to ~150 B per
 *     subject (10-20 KB total for a typical multi-subject learner).
 *   - HOWEVER, the realistic entry path is Home → Session, and Home already
 *     loads the inventory/overview into the React Query cache. In the warm-
 *     cache case (the common one), a narrow `/progress/counts` endpoint
 *     would fire an *additional* HTTP request that the existing cache
 *     already satisfies — a net regression.
 *   - Criterion (b) is not measurable in this PR — no production latency
 *     instrumentation on session entry vs. session entry-after-cold-start.
 *   - Server compute would not improve either: `totalTopicsCompleted`
 *     requires the same multi-table walk as the broad endpoint.
 *
 * Per the plan: "If neither criterion is testable in this PR, default to
 * keeping the facade and explicitly note the deferred decision." Both
 * criteria fail the net-positive bar, so the facade stays.
 *
 * Revisit when:
 *   - Production telemetry shows session entry stalled on cold-cache
 *     progress fetch on real devices, OR
 *   - A new surface needs these counts in isolation (no home pre-fetch), OR
 *   - The progress overview/inventory endpoints get more expensive on the
 *     server and bandwidth/compute decoupling becomes valuable.
 */
import { useOverallProgress, useProgressInventory } from './use-progress';

/**
 * Total number of completed sessions for the active profile.
 * Facade over `useProgressInventory().data?.global.totalSessions`.
 */
export function useTotalSessionCount(): number {
  const { data } = useProgressInventory();
  return data?.global.totalSessions ?? 0;
}

/**
 * Returns true if the active profile has never completed a session.
 * Facade over `useProgressInventory().data?.global.totalSessions === 0`.
 */
export function useIsFirstSession(): boolean {
  return useTotalSessionCount() === 0;
}

/**
 * Total number of topics the active profile has completed (any subject).
 * Facade over `useOverallProgress().data?.totalTopicsCompleted`.
 */
export function useTotalTopicsCompleted(): number {
  const { data } = useOverallProgress();
  return data?.totalTopicsCompleted ?? 0;
}
