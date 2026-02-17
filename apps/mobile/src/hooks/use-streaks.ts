import { useQuery } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

interface Streak {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  gracePeriodStartDate: string | null;
  isOnGracePeriod: boolean;
  graceDaysRemaining: number;
}

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
