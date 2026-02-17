import { useQuery } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

interface Subject {
  id: string;
  name: string;
  status: string;
}

export function useSubjects() {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subjects', activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ subjects: Subject[] }>('/subjects');
      return data.subjects;
    },
    enabled: !!activeProfile,
  });
}
