import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { recapsResponseSchema, type RecapListItem } from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { combinedSignal } from '../lib/query-timeout';
import { queryKeys } from '../lib/query-keys';
import { useNavigationContract } from './use-navigation-contract';
import { useProfile } from '../lib/profile';

export function useRecaps(
  childProfileId?: string,
): UseQueryResult<RecapListItem[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const navigationContract = useNavigationContract();

  return useQuery({
    queryKey: queryKeys.recaps.list(
      navigationContract.effectiveAppContext,
      activeProfile?.id,
      childProfileId,
    ),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.recaps.$get(
          {
            query: {
              ...(childProfileId ? { childProfileId } : {}),
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return recapsResponseSchema.parse(await res.json()).recaps;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      navigationContract.effectiveAppContext === 'family' &&
      navigationContract.isFamilyCapable,
    staleTime: 60_000,
  });
}
