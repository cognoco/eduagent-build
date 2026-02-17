import { useQuery } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
import type { Profile } from '../lib/profile';

export function useProfiles() {
  const { get } = useApi();

  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const data = await get<{ profiles: Profile[] }>('/profiles');
      return data.profiles;
    },
  });
}
