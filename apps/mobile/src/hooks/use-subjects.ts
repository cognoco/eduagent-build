import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { Subject, SubjectStatus } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

interface UseSubjectsOptions {
  includeInactive?: boolean;
}

export function useSubjects(
  options: UseSubjectsOptions = {}
): UseQueryResult<Subject[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const { includeInactive = false } = options;

  return useQuery({
    queryKey: ['subjects', activeProfile?.id, includeInactive],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects.$get({
          ...(includeInactive
            ? { query: { includeInactive: 'true' } }
            : undefined),
          init: { signal },
        } as never);
        await assertOk(res);
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
      await assertOk(res);
      return (await res.json()) as { subject: Subject };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}

export function useUpdateSubject(): UseMutationResult<
  { subject: Subject },
  Error,
  { subjectId: string; name?: string; status?: SubjectStatus }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subjectId,
      ...input
    }: {
      subjectId: string;
      name?: string;
      status?: SubjectStatus;
    }) => {
      const res = await client.subjects[':id'].$patch({
        param: { id: subjectId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as { subject: Subject };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
