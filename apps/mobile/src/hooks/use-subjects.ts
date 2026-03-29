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
import { combinedSignal } from '../lib/query-timeout';

export function useSubjects(): UseQueryResult<Subject[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subjects', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects.$get({
          init: { signal },
        } as never);
        const data = await res.json();
        return data.subjects;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useCreateSubject(): UseMutationResult<
  { subject: Subject },
  Error,
  { name: string; rawInput?: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; rawInput?: string }) => {
      const res = await client.subjects.$post({ json: input });
      return (await res.json()) as { subject: Subject };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}
