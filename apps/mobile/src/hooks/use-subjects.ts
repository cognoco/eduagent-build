import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { Subject } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useSubjects(): UseQueryResult<Subject[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subjects', activeProfile?.id],
    queryFn: async () => {
      const res = await client.subjects.$get();
      const data = await res.json();
      return data.subjects;
    },
    enabled: !!activeProfile,
  });
}

export function useCreateSubject(): UseMutationResult<
  { subject: Subject },
  Error,
  { name: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const res = await client.subjects.$post({ json: input });
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}
