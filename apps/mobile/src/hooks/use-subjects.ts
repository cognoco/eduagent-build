import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  CefrLevel,
  PedagogyMode,
  Subject,
  SubjectStatus,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

interface UseSubjectsOptions {
  includeInactive?: boolean;
  enabled?: boolean;
}

export interface CreateSubjectResponse {
  subject: Subject;
  structureType: 'broad' | 'narrow' | 'focused_book';
  bookId?: string;
  bookTitle?: string;
  bookCount?: number;
}

interface UpdateSubjectInput {
  subjectId: string;
  name?: string;
  status?: SubjectStatus;
  pedagogyMode?: PedagogyMode;
  languageCode?: string | null;
}

function isTransientSubjectUpdateError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'NetworkError' ||
      error.name === 'RateLimitedError' ||
      (error.name === 'UpstreamError' &&
        'status' in error &&
        typeof (error as { status?: unknown }).status === 'number' &&
        ((error as { status: number }).status === 429 ||
          (error as { status: number }).status >= 500)))
  );
}

function subjectUpdateRetryDelay(attemptIndex: number, error: unknown): number {
  if (
    error instanceof Error &&
    error.name === 'RateLimitedError' &&
    'retryAfter' in error &&
    typeof (error as { retryAfter?: unknown }).retryAfter === 'number'
  ) {
    return Math.min((error as { retryAfter: number }).retryAfter * 1000, 3000);
  }

  return Math.min(500 * 2 ** attemptIndex, 3000);
}

export function useSubjects(
  options: UseSubjectsOptions = {},
): UseQueryResult<Subject[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const { includeInactive = false, enabled: callerEnabled } = options;

  return useQuery({
    queryKey: ['subjects', activeProfile?.id, includeInactive],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects.$get(
          {
            ...(includeInactive
              ? { query: { includeInactive: 'true' } }
              : undefined),
          },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.subjects;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && callerEnabled !== false,
  });
}

export function useCreateSubject(): UseMutationResult<
  CreateSubjectResponse,
  Error,
  {
    name: string;
    rawInput?: string;
    focus?: string;
    focusDescription?: string;
  }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      rawInput?: string;
      focus?: string;
      focusDescription?: string;
    }) => {
      const res = await client.subjects.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as CreateSubjectResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['curriculum'] });
    },
  });
}

export function useUpdateSubject(): UseMutationResult<
  { subject: Subject },
  Error,
  UpdateSubjectInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<{ subject: Subject }, Error, UpdateSubjectInput>({
    mutationFn: async ({ subjectId, ...input }) => {
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
    retry: (failureCount, error) =>
      failureCount < 2 && isTransientSubjectUpdateError(error),
    retryDelay: subjectUpdateRetryDelay,
  });
}

export function useConfigureLanguageSubject(): UseMutationResult<
  { subject: Subject },
  Error,
  {
    subjectId: string;
    nativeLanguage: string;
    startingLevel: CefrLevel;
  }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subjectId, ...input }) => {
      const res = await client.subjects[':id']['language-setup'].$put({
        param: { id: subjectId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as { subject: Subject };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });
}
