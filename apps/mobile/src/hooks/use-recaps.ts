import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  recapDetailResponseSchema,
  recapsResponseSchema,
  type RecapListItem,
} from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { combinedSignal } from '../lib/query-timeout';
import { queryKeys } from '../lib/query-keys';
import { parseJson } from '../lib/parse-json';
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
        return (await parseJson(res, recapsResponseSchema)).recaps;
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

export function useRecap(
  recapId: string | undefined,
): UseQueryResult<RecapListItem | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const navigationContract = useNavigationContract();

  return useQuery({
    queryKey: queryKeys.recaps.detail(
      navigationContract.effectiveAppContext,
      activeProfile?.id,
      recapId,
    ),
    queryFn: async ({ signal: querySignal }) => {
      if (!recapId) throw new Error('recapId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.recaps[':recapId'].$get(
          { param: { recapId } },
          { init: { signal } },
        );
        if (res.status === 404) return null;
        await assertOk(res);
        return (await parseJson(res, recapDetailResponseSchema)).recap;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      !!recapId &&
      navigationContract.effectiveAppContext === 'family' &&
      navigationContract.isFamilyCapable,
    staleTime: 60_000,
  });
}
