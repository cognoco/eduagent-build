import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Streak, XpSummary } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useStreaks(): UseQueryResult<Streak> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['streaks', activeProfile?.id],
    queryFn: async () => {
      const res = await client.streaks.$get();
      const data = await res.json();
      return data.streak;
    },
    enabled: !!activeProfile,
  });
}

export function useXpSummary(): UseQueryResult<XpSummary> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['xp', activeProfile?.id],
    queryFn: async () => {
      const res = await client.xp.$get();
      const data = await res.json();
      return data.xp;
    },
    enabled: !!activeProfile,
  });
}
