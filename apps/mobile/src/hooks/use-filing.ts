import { useCallback, useEffect, useRef, useState } from 'react';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  DetectedTopic,
  FilingResult,
  LearningSession,
} from '@eduagent/schemas';

import { useApiClient } from '../lib/api-client';
import { shouldRetryApiError } from '../lib/api-errors';
import { assertOk } from '../lib/assert-ok';
import type { NavigationAppContext } from '../lib/navigation-contract';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { queryKeys } from '../lib/query-keys';
import { useNavigationDataScopeContract } from './use-navigation-contract';

interface FilingInput {
  rawInput?: string;
  selectedSuggestion?: string | null;
  sessionTranscript?: string;
  sessionMode?: 'freeform' | 'homework';
  sessionId?: string;
  subjectId?: string;
  pickedSuggestionId?: string;
  usedTopicSuggestionId?: string;
}

type SessionFilingStatus = LearningSession['filingStatus'];

interface SessionLibraryMutationInput {
  sessionId: string;
}

interface SessionLibraryMutationResult {
  session: LearningSession;
}

const LIBRARY_FILING_POLL_INTERVAL_MS = 3_000;
const LIBRARY_FILING_MAX_POLLS = 10;
const TERMINAL_LIBRARY_FILING_STATUSES = new Set<
  NonNullable<SessionFilingStatus>
>(['filing_recovered', 'filing_failed', 'filing_kept_out']);

function isTerminalLibraryFilingStatus(
  filingStatus: SessionFilingStatus,
): boolean {
  return (
    filingStatus != null && TERMINAL_LIBRARY_FILING_STATUSES.has(filingStatus)
  );
}

function shouldPollLibraryFiling(session: LearningSession | null | undefined) {
  if (!session) return false;
  if (isTerminalLibraryFilingStatus(session.filingStatus)) return false;
  if (session.topicId || session.filedAt) return false;
  return (
    session.filingStatus === 'filing_pending' || session.filingStatus == null
  );
}

function invalidateLibraryFilingQueries(
  queryClient: QueryClient,
  input: {
    sessionId: string;
    profileId: string | undefined;
    mode: NavigationAppContext;
    topicId?: string | null;
  },
): void {
  const { sessionId, profileId, mode, topicId } = input;

  void queryClient.invalidateQueries({
    predicate: (query) =>
      queryKeys.sessions.matchAnyMode(sessionId, profileId)(query.queryKey),
  });
  void queryClient.invalidateQueries({
    predicate: (query) =>
      queryKeys.sessions.matchSummaryAnyMode(
        sessionId,
        profileId,
      )(query.queryKey),
  });
  void queryClient.invalidateQueries({
    predicate: (query) =>
      queryKeys.sessions.matchTranscriptAnyMode(
        sessionId,
        profileId,
      )(query.queryKey),
  });
  void queryClient.invalidateQueries({ queryKey: ['subjects'] });
  void queryClient.invalidateQueries({ queryKey: ['books'] });
  void queryClient.invalidateQueries({ queryKey: ['book-suggestions'] });
  void queryClient.invalidateQueries({ queryKey: ['topic-suggestions'] });
  void queryClient.invalidateQueries({ queryKey: ['progress'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['retention'] });
  void queryClient.invalidateQueries({ queryKey: ['library'] });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.library.retention(profileId),
  });

  if (topicId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.retention.topic(topicId, profileId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.progress.resolveTopicSubject(
        mode,
        topicId,
        profileId,
      ),
    });
  }
}

type SessionLibraryMutationKind = 'keep-out' | 'add' | 'restore' | 'retry';

function useSessionLibraryMutation(
  kind: SessionLibraryMutationKind,
): UseMutationResult<
  SessionLibraryMutationResult,
  Error,
  SessionLibraryMutationInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();
  const navigationContract = useNavigationDataScopeContract();
  const mode = navigationContract.queryScope.appContext;
  const profileId = activeProfile?.id;

  return useMutation({
    mutationFn: async ({ sessionId }) => {
      let res: Response;
      if (kind === 'keep-out') {
        res = await client.sessions[':sessionId']['library-filing'][
          'keep-out'
        ].$post({
          param: { sessionId },
        });
      } else if (kind === 'add') {
        res = await client.sessions[':sessionId']['library-filing'].add.$post({
          param: { sessionId },
        });
      } else if (kind === 'restore') {
        res = await client.sessions[':sessionId'][
          'library-filing'
        ].restore.$post({
          param: { sessionId },
        });
      } else {
        res = await client.sessions[':sessionId']['retry-filing'].$post({
          param: { sessionId },
        });
      }

      const okRes = await assertOk(res);
      return (await okRes.json()) as SessionLibraryMutationResult;
    },
    onSuccess: (data, { sessionId }) => {
      invalidateLibraryFilingQueries(queryClient, {
        sessionId,
        profileId,
        mode,
        topicId: data.session.topicId,
      });
    },
  });
}

export function useFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FilingInput) => {
      const res = await client.filing.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as FilingResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      void queryClient.invalidateQueries({ queryKey: ['book-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-suggestions'] });
    },
  });
}

export function useSessionLibraryFiling(
  sessionId: string,
): UseQueryResult<LearningSession | null> & {
  session: LearningSession | null;
  filingStatus: SessionFilingStatus;
  isPollingForFiling: boolean;
  timedOutStillPending: boolean;
  canRetry: boolean;
  isTerminalFailure: boolean;
  isKeptOut: boolean;
  isFiledInLibrary: boolean;
  pollCount: number;
} {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const navigationContract = useNavigationDataScopeContract();
  const mode = navigationContract.queryScope.appContext;
  const pollCountRef = useRef(0);
  const manualPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [pollBudgetExhausted, setPollBudgetExhausted] = useState(false);
  // TanStack Query v5's internal refetchInterval scheduler does not reliably
  // tick under jest fake timers (verified 2026-05-25 on @tanstack/react-query
  // ^5.100.10). In tests, fall back to a deterministic setTimeout we own so
  // jest.advanceTimersByTimeAsync drives polling. Production uses the
  // native refetchInterval below.
  const useManualPollingFallback = process.env.NODE_ENV === 'test';

  const reserveNextPoll = useCallback((): boolean => {
    if (pollCountRef.current >= LIBRARY_FILING_MAX_POLLS) {
      setPollBudgetExhausted(true);
      return false;
    }

    pollCountRef.current += 1;
    setPollCount(pollCountRef.current);
    return true;
  }, []);

  useEffect(() => {
    if (manualPollTimerRef.current) {
      clearTimeout(manualPollTimerRef.current);
      manualPollTimerRef.current = null;
    }
    pollCountRef.current = 0;
    setPollCount(0);
    setPollBudgetExhausted(false);
    return () => {
      if (manualPollTimerRef.current) {
        clearTimeout(manualPollTimerRef.current);
        manualPollTimerRef.current = null;
      }
    };
  }, [sessionId]);

  const query = useQuery({
    queryKey: queryKeys.sessions.detail(mode, sessionId, activeProfile?.id),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId'].$get(
          { param: { sessionId } },
          { init: { signal } },
        );
        const okRes = await assertOk(res);
        const data = (await okRes.json()) as { session: LearningSession };
        return data.session;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
    refetchInterval: (queryState) => {
      if (useManualPollingFallback) {
        return false;
      }

      const session = queryState.state.data;
      if (!shouldPollLibraryFiling(session)) {
        return false;
      }

      return reserveNextPoll() ? LIBRARY_FILING_POLL_INTERVAL_MS : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: shouldRetryApiError,
  });

  const session = query.data ?? null;
  const { dataUpdatedAt, isFetching, refetch } = query;

  useEffect(() => {
    if (!useManualPollingFallback) return undefined;
    if (isFetching) return undefined;
    if (!shouldPollLibraryFiling(session)) {
      if (manualPollTimerRef.current) {
        clearTimeout(manualPollTimerRef.current);
        manualPollTimerRef.current = null;
      }
      return undefined;
    }
    if (manualPollTimerRef.current) return undefined;
    if (!reserveNextPoll()) return undefined;

    const timer = setTimeout(() => {
      manualPollTimerRef.current = null;
      void refetch();
    }, LIBRARY_FILING_POLL_INTERVAL_MS);
    manualPollTimerRef.current = timer;

    return () => {
      if (manualPollTimerRef.current === timer) {
        clearTimeout(timer);
        manualPollTimerRef.current = null;
      }
    };
  }, [
    dataUpdatedAt,
    isFetching,
    refetch,
    reserveNextPoll,
    session,
    useManualPollingFallback,
  ]);

  const filingStatus = session?.filingStatus ?? null;
  const isPollingForFiling =
    shouldPollLibraryFiling(session) && !pollBudgetExhausted;
  const timedOutStillPending =
    pollBudgetExhausted && shouldPollLibraryFiling(session);
  const isTerminalFailure = filingStatus === 'filing_failed';
  const isKeptOut = filingStatus === 'filing_kept_out';
  const isFiledInLibrary =
    filingStatus === 'filing_recovered' ||
    !!session?.topicId ||
    !!session?.filedAt;

  return {
    ...query,
    session,
    filingStatus,
    isPollingForFiling,
    timedOutStillPending,
    canRetry: isTerminalFailure,
    isTerminalFailure,
    isKeptOut,
    isFiledInLibrary,
    pollCount,
  };
}

export function useKeepSessionOutOfLibrary(): UseMutationResult<
  SessionLibraryMutationResult,
  Error,
  SessionLibraryMutationInput
> {
  return useSessionLibraryMutation('keep-out');
}

export function useAddSessionToLibrary(): UseMutationResult<
  SessionLibraryMutationResult,
  Error,
  SessionLibraryMutationInput
> {
  return useSessionLibraryMutation('add');
}

export function useRestoreSessionLibraryFiling(): UseMutationResult<
  SessionLibraryMutationResult,
  Error,
  SessionLibraryMutationInput
> {
  return useSessionLibraryMutation('restore');
}

export function useRetrySessionLibraryFiling(): UseMutationResult<
  SessionLibraryMutationResult,
  Error,
  SessionLibraryMutationInput
> {
  return useSessionLibraryMutation('retry');
}

export interface UnsupportedRenameFiledLibraryTopicMutation {
  isSupported: false;
  missingBackendRoute: 'PATCH /topics/:topicId/rename';
  mutateAsync: (input: { topicId: string; title: string }) => Promise<never>;
}

export function useRenameFiledLibraryTopic(): UnsupportedRenameFiledLibraryTopicMutation {
  return {
    isSupported: false,
    missingBackendRoute: 'PATCH /topics/:topicId/rename',
    mutateAsync: async () => {
      throw new Error('Topic rename is not supported by the API yet.');
    },
  };
}

export function useMultiTopicFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      topics: DetectedTopic[];
    }) => {
      const results: FilingResult[] = [];
      for (const topic of input.topics) {
        const res = await client.filing.$post({
          json: {
            sessionId: input.sessionId,
            sessionMode: 'freeform',
            selectedSuggestion: topic.summary,
          },
        });
        await assertOk(res);
        results.push((await res.json()) as FilingResult);
      }
      return results;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      void queryClient.invalidateQueries({ queryKey: ['book-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-suggestions'] });
    },
  });
}
