import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardData } from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

export function useDashboard(): UseQueryResult<DashboardData> {
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
