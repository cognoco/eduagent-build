import { useNavigationContract } from './use-navigation-contract';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import { Sentry } from '../lib/sentry';
import type {
  NavigationContract,
  RouteKey,
  RouteParams,
} from '../lib/navigation-contract';

/**
 * Centralized entry-gate predicate shared by the learning-flow screens
 * (session/homework/dictation/quiz layouts, mentor-memory, topic/relearn).
 *
 * The flag branch is intentional and must not be collapsed to `!canEnter(...)`:
 * when V1 is off, the contract's `canEnter()` returns false during the
 * profile-load window (activeProfile === null), which would redirect cold
 * deep-link entries to /home. The V1-off arm uses `isParentProxy` instead so
 * those entries are allowed through — preserving the legacy (V0 / flags-off)
 * profile-load allow-through behavior. Lifting this verbatim keeps behavior
 * identical across all three flag states × proxy/non-proxy.
 *
 * @param v1Enabled - pass FEATURE_FLAGS.MODE_NAV_V1_ENABLED; explicit param
 *   makes this a pure function testable without mocking the flags module.
 */
export function computeEntryGateBlocked(
  contract: NavigationContract,
  routeKey: RouteKey,
  params: RouteParams | undefined,
  v1Enabled: boolean,
): boolean {
  return v1Enabled
    ? !contract.canEnter(routeKey, params)
    : contract.isParentProxy;
}

/**
 * Returns whether the current user is blocked from entering `routeKey`.
 *
 * When blocked, emits a navigation breadcrumb so triage can see why a user
 * ended up redirected to home instead of the flow they tapped (race between
 * mount and contract resolution, revoked family link, stale deep-link).
 * Screens own their own redirect element — this hook only computes the gate.
 */
export function useEntryGate(
  routeKey: RouteKey,
  params?: RouteParams,
): boolean {
  const navigationContract = useNavigationContract();
  const blocked = computeEntryGateBlocked(
    navigationContract,
    routeKey,
    params,
    FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
  );

  if (blocked) {
    Sentry.addBreadcrumb({
      category: 'navigation',
      level: 'info',
      message: 'entry-gate blocked — redirecting to home',
      data: {
        route: routeKey,
        params,
        isParentProxy: navigationContract.isParentProxy,
        shape: navigationContract.shape,
        v1Enabled: FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
      },
    });
  }

  return blocked;
}
