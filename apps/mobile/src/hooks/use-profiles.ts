import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { useApiClient } from '../lib/api-client';
import type { Profile } from '@eduagent/schemas';
import { combinedSignal } from '../lib/query-timeout';

export function useProfiles(): UseQueryResult<Profile[]> {
  const client = useApiClient();
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['profiles'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.profiles.$get({
          init: { signal },
        } as never);
        const data = await res.json();
        return data.profiles;
      } finally {
        cleanup();
      }
    },
    enabled: !!isSignedIn,
  });
}
