import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import {
  residenceCountryListSchema,
  type ResidenceCountryOption,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { combinedSignal } from '../lib/query-timeout';
import { parseJson } from '../lib/parse-json';
import { queryKeys } from '../lib/query-keys';

/**
 * [WI-2743 AC-1] The habitual-residence country list, sourced from
 * `country_policy_registry` rather than a hard-coded picker list.
 *
 * DELIBERATELY NOT `useApiQuery`, and this is the whole reason: that wrapper
 * ends its `enabled` with `&& !!activeProfile` (use-api-query.ts:84). The first
 * surface AC-1 names is SIGNUP, where `activeProfile` is null by construction —
 * `create-profile.tsx` derives `isFirstProfileCreation` from
 * `!activeProfile && profiles.length === 0`. Routed through the wrapper this
 * query would sit permanently disabled on the exact screen that needs it, and
 * it would fail silently: a disabled query is not an error, it is an empty
 * picker.
 *
 * Gated on Clerk auth instead, matching `useDeletionStatus` in use-account.ts —
 * the established pattern for a query that must run before a profile exists.
 * The route requires authentication but no account or profile scope.
 */
export function useResidenceCountries(): UseQueryResult<
  ResidenceCountryOption[],
  Error
> {
  const client = useApiClient();
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: queryKeys.residenceCountries(),
    // The registry moves on regulatory updates, not on sessions. Refetching it
    // per mount would re-fetch an identical body behind every signup step.
    staleTime: 60 * 60 * 1000,
    queryFn: async ({
      signal: querySignal,
    }): Promise<ResidenceCountryOption[]> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.profiles['residence-countries'].$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        // Parsed at the trust boundary; the caller receives the array only.
        const body = await parseJson(
          res,
          residenceCountryListSchema,
          'GET /profiles/residence-countries',
        );
        return body.countries;
      } finally {
        cleanup();
      }
    },
    enabled: !!isSignedIn,
  });
}
