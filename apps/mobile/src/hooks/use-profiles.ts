import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import type { Profile } from '../lib/profile';

export function useProfiles(): UseQueryResult<Profile[]> {
  const client = useApiClient();

  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const res = await client.profiles.$get();
      const data = await res.json();
      return data.profiles;
    },
  });
}
