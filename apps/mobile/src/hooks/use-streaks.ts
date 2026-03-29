import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Streak, XpSummary } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';

export function useStreaks(): UseQueryResult<Streak> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['streaks', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.streaks.$get({
          init: { signal },
        } as never);
        const data = await res.json();
        return data.streak;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useXpSummary(): UseQueryResult<XpSummary> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['xp', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.xp.$get({
          init: { signal },
        } as never);
        const data = await res.json();
        return data.xp;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}
