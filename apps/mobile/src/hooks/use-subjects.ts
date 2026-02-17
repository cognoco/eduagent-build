import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Subject } from '@eduagent/schemas';
import { useApi } from '../lib/auth-api';
import { useProfile } from '../lib/profile';

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

export function useCreateSubject() {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string }) =>
      post<{ subject: Subject }>('/subjects', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}
