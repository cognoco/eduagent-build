import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  CefrLevel,
  DeleteSubjectResponse,
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

interface DeleteSubjectInput {
  subjectId: string;
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

const PREPARING_POLL_MS = 3000;

export function useSubjects(
  options: UseSubjectsOptions = {},
): UseQueryResult<Subject[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const { includeInactive = false, enabled: callerEnabled } = options;

  const result = useQuery({
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
    refetchInterval: (query) => {
      const subjects = query.state.data;
      if (!Array.isArray(subjects)) return false;
      const hasPreparing = subjects.some(
        (s) => s.curriculumStatus === 'preparing',
      );
      return hasPreparing ? PREPARING_POLL_MS : false;
    },
  });

  return result;
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
      // PR-10 deferred: broad ['progress'] — subject updates (name, status, archive)
      // affect progress.subject and progress.overview for that subject, but
      // activeProfileId is not available in this hook's closure (useUpdateSubject
      // does not call useProfile). Keep broad until narrowing is proven by test.
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
    retry: (failureCount, error) =>
      failureCount < 2 && isTransientSubjectUpdateError(error),
    retryDelay: subjectUpdateRetryDelay,
  });
}

export function useDeleteSubject(): UseMutationResult<
  DeleteSubjectResponse,
  Error,
  DeleteSubjectInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<DeleteSubjectResponse, Error, DeleteSubjectInput>({
    mutationFn: async ({ subjectId }) => {
      const res = await client.subjects[':id'].$delete({
        param: { id: subjectId },
      });
      await assertOk(res);
      return (await res.json()) as DeleteSubjectResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['curriculum'] });
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export interface RetryCurriculumResponse {
  dispatched: number;
}

/**
 * Re-triggers curriculum generation for a subject whose initial generation
 * stalled or failed (LLM timeout/error left books with topicsGenerated=false).
 * The server finds every stuck book under the subject and re-dispatches the
 * Inngest retry event; the dispatch is single-flight guarded server-side
 * (curriculum_books.retry_in_flight, WI-125), so repeated calls are safe.
 *
 * This is the escape hatch for the "Setting up <subject>…" dead-end on the
 * home subject carousel: without it, a subject whose curriculum never
 * generates is stuck non-interactive forever with no way to recover.
 */
export function useRetryCurriculum(): UseMutationResult<
  RetryCurriculumResponse,
  Error,
  { subjectId: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<RetryCurriculumResponse, Error, { subjectId: string }>({
    mutationFn: async ({ subjectId }) => {
      const res = await client.subjects[':id']['retry-curriculum'].$post({
        param: { id: subjectId },
      });
      await assertOk(res);
      return (await res.json()) as RetryCurriculumResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['curriculum'] });
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
