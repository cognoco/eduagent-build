import { useQuery } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

interface DashboardChild {
  profileId: string;
  displayName: string;
  summary: string;
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  subjects: { name: string; retentionStatus: string }[];
}

interface DashboardData {
  children: DashboardChild[];
  demoMode: boolean;
}

export function useDashboard() {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', activeProfile?.id],
    queryFn: async () => {
      const data = await get<DashboardData>('/dashboard');

      if (data.children.length === 0) {
        return await get<DashboardData>('/dashboard/demo');
      }

      return data;
    },
    enabled: !!activeProfile,
  });
}
