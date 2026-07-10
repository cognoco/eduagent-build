import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/expo';
import { accountEmailUpdateResponseSchema } from '@eduagent/schemas';

import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import { Sentry } from '../lib/sentry';

/**
 * [CRITICAL-1] App-side reconciliation of the Clerk primary email against the
 * persisted server `accounts.email`.
 *
 * The email-change flow promotes the new address in Clerk and then syncs the
 * server row. If the app is backgrounded / killed / crashes in the window
 * between those two steps, Clerk primary = new email but `accounts.email` =
 * old, and the in-component retry handle is gone — leaving the GDPR-export
 * identity permanently wrong with no in-app recovery.
 *
 * This hook closes that gap independently of the ChangeEmail component: on
 * mount (for the account owner) it compares the Clerk primary email to the
 * server email and, if they diverge, re-fires the idempotent sync with the
 * verified Clerk primary. The server (`updateAccountEmailFromClerk`) re-checks
 * the requested email against the caller's verified Clerk primary, so a client
 * cannot push an arbitrary address through this path.
 *
 * It runs once per mount and stays non-blocking on failure (captured to
 * Sentry, then it simply retries the next time the account surface mounts) so
 * it never blocks or disrupts the UI.
 *
 * @param enabled gate to the owner surface (showAccountSecurity) — the GET is
 *   owner-only, so running it for a non-owner would just 403.
 */
export function useEmailReconciliation(enabled: boolean): void {
  const { user, isLoaded } = useUser();
  const api = useApiClient();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isLoaded || !user) return;
    const clerkPrimary = user.primaryEmailAddress?.emailAddress;
    if (!clerkPrimary) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    let cancelled = false;
    const normalize = (value: string): string => value.trim().toLowerCase();

    void (async () => {
      try {
        const res = await api.account.email.$get();
        // 401/403/etc — not the owner or not ready; nothing to reconcile.
        if (!res.ok) return;
        const { email: serverEmail } = await parseJson(
          res,
          accountEmailUpdateResponseSchema,
        );
        if (cancelled) return;
        if (normalize(serverEmail) === normalize(clerkPrimary)) return;

        // Divergence detected — re-fire the idempotent server sync.
        const patchRes = await api.account.email.$patch({
          json: { email: clerkPrimary },
        });
        await assertOk(patchRes);
      } catch (err) {
        // Auth-adjacent silent recovery must stay queryable in production
        // (the hook itself remains non-blocking; it retries on next mount).
        Sentry.captureException(err, {
          tags: { feature: 'email_reconciliation', surface: 'account_screen' },
        });
        if (__DEV__) {
          console.warn(
            '[email-reconciliation] sync skipped — will retry on next mount:',
            err,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, enabled, isLoaded, user]);
}
