/**
 * Session-owned facade hooks.
 *
 * These hooks exist to enforce the surface-ownership rule that session and
 * session-summary screens do NOT directly import progress hooks. They
 * encapsulate the dependency on `useProgressInventory` / `useOverallProgress`
 * behind a session-domain name.
 *
 * Status: IMPORT-BOUNDARY FACADE.
 *
 * They currently reuse the existing progress queries. They are NOT a payload-
 * narrow read — cold-cache session entry still fetches the full progress
 * inventory / overview payload. PR 9 may convert these to true narrow
 * endpoints if profiling shows it's worth it; until then this is a pure
 * boundary-enforcement layer.
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
