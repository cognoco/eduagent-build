import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardData } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useDashboard(): UseQueryResult<DashboardData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', activeProfile?.id],
    queryFn: async () => {
      const res = await client.dashboard.$get();
      const data = await res.json();

      if (data.children.length === 0) {
        const demoRes = await client.dashboard.demo.$get();
        return await demoRes.json();
      }

      return data;
    },
    enabled: !!activeProfile,
  });
}
