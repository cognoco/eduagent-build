import { useQuery } from '@tanstack/react-query';
import type { Streak } from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

export function useStreaks() {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['streaks', activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ streak: Streak }>('/streaks');
      return data.streak;
    },
    enabled: !!activeProfile,
  });
}
