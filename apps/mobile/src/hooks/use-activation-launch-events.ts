import { useEffect, useRef } from 'react';
import type { ReportActivationEvent } from '../lib/activation-events';

/**
 * [WI-1689] app_opened / day2_return — fired once per mount (cold launch),
 * gated on an existing Clerk session: POST /v1/activation-events requires a
 * valid Clerk JWT for every request (authMiddleware is global;
 * PRE_GRAPH_ALLOWLIST only waives the account/profile-row requirement, not
 * auth — see activation-events.ts route header). A genuinely signed-out
 * first-ever open cannot be recorded under the current auth contract; this
 * is a documented gap pending a server-side pre-auth allowance, not a
 * silent drop.
 *
 * day2_return uses the Clerk user's `createdAt` (not a locally persisted
 * timestamp) as the signup-day anchor, so sign-out/sign-in on the same
 * device never resets it and no new device-local state is needed.
 *
 * Extracted from ThemedApp (apps/mobile/src/app/_layout.tsx) so this
 * guard/gate/date-comparison logic is unit-testable in isolation.
 *
 * app_opened and day2_return latch independently. On a signed-in cold
 * launch, `useUser()` can still be loading — if a single combined latch
 * consumed itself before `userCreatedAt` existed, the day-2 check would be
 * permanently skipped once the user object arrived on a later render. The
 * day2_return latch only sets once it actually fires, so a later render
 * carrying a hydrated `userCreatedAt` still gets evaluated.
 */
export function useActivationLaunchEvents(params: {
  isSignedIn: boolean | undefined;
  userCreatedAt: Date | null | undefined;
  reportActivationEvent: ReportActivationEvent;
}): void {
  const { isSignedIn, userCreatedAt, reportActivationEvent } = params;
  const hasReportedAppOpenRef = useRef(false);
  const hasReportedDay2Ref = useRef(false);

  useEffect(() => {
    if (!isSignedIn) return;

    if (!hasReportedAppOpenRef.current) {
      hasReportedAppOpenRef.current = true;
      reportActivationEvent('app_opened', { route: 'app_launch' });
    }

    if (!hasReportedDay2Ref.current && userCreatedAt) {
      const signupUtcDay = userCreatedAt.toISOString().slice(0, 10);
      const todayUtcDay = new Date().toISOString().slice(0, 10);
      if (todayUtcDay > signupUtcDay) {
        hasReportedDay2Ref.current = true;
        reportActivationEvent('day2_return', { route: 'app_launch' });
      }
    }
  }, [isSignedIn, userCreatedAt, reportActivationEvent]);
}
