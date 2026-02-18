import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Streak } from '@eduagent/schemas';
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
