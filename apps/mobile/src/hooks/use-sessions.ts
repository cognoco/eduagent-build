import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { transcriptResponseSchema } from '@eduagent/schemas';
import { useApiQuery } from './use-api-query';
import type {
  CelebrationReason,
  CloseResult,
  ContentFlagInput,
  HomeworkSessionMetadata,
  InputMode,
  LearningSession,
  MessageResult,
  ParkingLotItem,
  SessionMetadata,
  SessionAnalyticsEventInput,
  SessionStartResult,
  SessionSummary,
  SkipSummaryResponse,
  SubmitSummaryResult,
  TranscriptResponse,
  SessionType,
  RecallBridgeResult,
  RetrySummaryFeedbackResult,
  VerificationType,
  SystemPromptIntent,
} from '@eduagent/schemas';
import {
  closeResultSchema,
  homeworkStateSyncResponseSchema,
  messageResultSchema,
  parkingLotAddResponseSchema,
  parkingLotItemsResponseSchema,
  recallBridgeResultSchema,
  retrySummaryFeedbackResultSchema,
  sessionStartResultSchema,
  sessionSummaryGetResponseSchema,
  skipSummaryResponseSchema,
  submitSummaryResultSchema,
} from '@eduagent/schemas';
import { z } from 'zod';
import { useApiClient } from '../lib/api-client';
import { shouldRetryApiError } from '../lib/api-errors';
import { parseJson } from '../lib/parse-json';
import { useProfile } from '../lib/profile';
import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import { combinedSignal, createTimeoutSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { queryKeys } from '../lib/query-keys';
import { useNavigationDataScopeContract } from './use-navigation-contract';

export { useStreamMessage } from './use-stream-message';

const SUBMIT_SUMMARY_TIMEOUT_MS = 35_000;

function invalidateSessionDerivedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  // PR-10 deferred: broad ['progress'], ['dashboard'], ['retention'],
  // ['language-progress'], ['resume-nudge'] — session-close touches many surfaces
  // (summary, profile sessions list, progress overview, progress inventory,
  // progress milestones, dashboard child views, retention subject/topic, resume
  // nudge). A workflow test enumerating all surfaces is required before narrowing.
  // The old ['sessions'] call was a no-op (top segment is 'sessions' but all
  // session keys use 'session', 'session-transcript', etc.) — removed PR 10.
  void queryClient.invalidateQueries({ queryKey: ['progress'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['retention'] });
  void queryClient.invalidateQueries({ queryKey: ['language-progress'] });
  void queryClient.invalidateQueries({ queryKey: ['resume-nudge'] });
}

function invalidateSessionHistoryQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string | undefined,
): void {
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKeys.historySessionsMatch(profileId)(queryKey),
  });
}

function useSessionNavigationScope(): {
  activeProfile: ReturnType<typeof useProfile>['activeProfile'];
  mode: ReturnType<typeof useAppContext>['mode'];
  profileId: string | undefined;
} {
  const { activeProfile } = useProfile();
  const { mode: legacyMode } = useAppContext();
  const navigationContract = useNavigationDataScopeContract();

  if (!FEATURE_FLAGS.MODE_NAV_V1_ENABLED) {
    return { activeProfile, mode: legacyMode, profileId: activeProfile?.id };
  }

  return {
    activeProfile,
    mode: navigationContract.queryScope.appContext,
    profileId: navigationContract.queryScope.profileId ?? undefined,
  };
}

type FilingStatus =
  | 'filing_pending'
  | 'filing_failed'
  | 'filing_recovered'
  | 'filing_kept_out'
  | null
  | undefined;

interface SessionDerivedMutationContext {
  profileId: string | undefined;
}

export function computeFilingRefetchInterval(
  filingStatus: FilingStatus,
): number | false {
  return filingStatus === 'filing_pending' ? 15_000 : false;
}

export function useStartSession(subjectId: string): UseMutationResult<
  SessionStartResult,
  Error,
  {
    subjectId: string;
    topicId?: string;
    sessionType?: SessionType;
    verificationType?: VerificationType;
    inputMode?: InputMode;
    metadata?: SessionMetadata;
    rawInput?: string;
  }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      subjectId: string;
      topicId?: string;
      sessionType?: SessionType;
      verificationType?: VerificationType;
      inputMode?: InputMode;
      metadata?: SessionMetadata;
      rawInput?: string;
    }): Promise<SessionStartResult> => {
      const res = await client.subjects[':subjectId'].sessions.$post({
        param: { subjectId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        sessionStartResultSchema,
        'POST /subjects/:subjectId/sessions',
      );
    },
    onSuccess: () => {
      invalidateSessionDerivedQueries(queryClient);
    },
  });
}

export function useStartFirstCurriculumSession(
  subjectId: string,
): UseMutationResult<
  SessionStartResult,
  Error,
  {
    bookId?: string;
    topicId?: string;
    sessionType?: SessionType;
    verificationType?: VerificationType;
    inputMode?: InputMode;
  }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      bookId?: string;
      topicId?: string;
      sessionType?: SessionType;
      verificationType?: VerificationType;
      inputMode?: InputMode;
    }): Promise<SessionStartResult> => {
      const res = await client.subjects[':subjectId'].sessions[
        'first-curriculum'
      ].$post({
        param: { subjectId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        sessionStartResultSchema,
        'POST /subjects/:subjectId/sessions/first-curriculum',
      );
    },
    onSuccess: () => {
      invalidateSessionDerivedQueries(queryClient);
    },
  });
}

export function useSetSessionInputMode(
  sessionId: string,
): UseMutationResult<SessionStartResult, Error, { inputMode: InputMode }> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async (input: { inputMode: InputMode }) => {
      const res = await client.sessions[':sessionId']['input-mode'].$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        sessionStartResultSchema,
        'POST /sessions/:sessionId/input-mode',
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchTranscriptAnyMode(
            sessionId,
            profileId,
          )(query.queryKey),
      });
      // Input mode changes only mutate the session row/transcript metadata.
      // Progress, dashboard, retention, language-progress, and resume-nudge
      // data derive from completed learning activity, not this preference flip.
      // The old ['sessions'] call here was a no-op (top segment 'sessions' matches
      // no registered key; session keys use 'session', 'session-transcript', etc.)
      // — removed PR 10.
    },
  });
}

export function useClearContinuationDepth(
  sessionId: string,
): UseMutationResult<SessionStartResult, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async () => {
      const res = await client.sessions[':sessionId'][
        'clear-continuation-depth'
      ].$patch({
        param: { sessionId },
      });
      await assertOk(res);
      return parseJson(
        res,
        sessionStartResultSchema,
        'PATCH /sessions/:sessionId/clear-continuation-depth',
      );
    },
    onMutate: (): SessionDerivedMutationContext => ({ profileId }),
    onSuccess: (_data, _variables, mutationContext) => {
      const mutationProfileId = mutationContext?.profileId;
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchAnyMode(
            sessionId,
            mutationProfileId,
          )(query.queryKey),
      });
      invalidateSessionDerivedQueries(queryClient);
    },
  });
}

export function useSyncHomeworkState(
  sessionId: string,
): UseMutationResult<
  { metadata: HomeworkSessionMetadata },
  Error,
  { metadata: HomeworkSessionMetadata }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { metadata: HomeworkSessionMetadata }) => {
      const res = await client.sessions[':sessionId']['homework-state'].$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        homeworkStateSyncResponseSchema,
        'POST /sessions/:sessionId/homework-state',
      );
    },
    onSuccess: () => {
      invalidateSessionDerivedQueries(queryClient);
    },
  });
}

export function useSendMessage(
  sessionId: string,
): UseMutationResult<MessageResult, Error, { message: string }> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: { message: string }) => {
      const res = await client.sessions[':sessionId'].messages.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        messageResultSchema,
        'POST /sessions/:sessionId/messages',
      );
    },
  });
}

export function useCloseSession(sessionId: string): UseMutationResult<
  CloseResult,
  Error,
  {
    reason?: 'user_ended' | 'silence_timeout';
    summaryStatus?:
      | 'pending'
      | 'submitted'
      | 'accepted'
      | 'skipped'
      | 'auto_closed';
    milestonesReached?: CelebrationReason[];
  }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async (input = {}) => {
      const res = await client.sessions[':sessionId'].close.$post({
        param: { sessionId },
        json: input as Record<string, unknown>,
      });
      await assertOk(res);
      return parseJson(
        res,
        closeResultSchema,
        'POST /sessions/:sessionId/close',
      );
    },
    onMutate: (): SessionDerivedMutationContext => ({ profileId }),
    onSuccess: (_data, _variables, mutationContext) => {
      invalidateSessionDerivedQueries(queryClient);
      invalidateSessionHistoryQueries(queryClient, mutationContext?.profileId);
    },
  });
}

export function useSessionTranscript(
  sessionId: string,
): UseQueryResult<TranscriptResponse | null> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSessionNavigationScope();

  return useQuery({
    queryKey: queryKeys.sessions.transcript(mode, sessionId, profileId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId'].transcript.$get(
          { param: { sessionId } },
          { init: { signal } },
        );
        await assertOk(res);
        return parseJson(
          res,
          transcriptResponseSchema,
          'GET /sessions/:sessionId/transcript',
        );
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
    // Don't retry client errors (404/403) — the session is gone, retrying
    // just delays the expired-session UI by several seconds.
    retry: shouldRetryApiError,
  });
}

export function useSession(
  sessionId: string,
): UseQueryResult<LearningSession | null> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSessionNavigationScope();

  return useQuery({
    queryKey: queryKeys.sessions.detail(mode, sessionId, profileId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId'].$get(
          { param: { sessionId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await parseJson(
          res,
          sessionStartResultSchema,
          'GET /sessions/:sessionId',
        );
        return data.session;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
    refetchInterval: (query) =>
      computeFilingRefetchInterval(query.state.data?.filingStatus),
    retry: shouldRetryApiError,
  });
}

export function useRecordSystemPrompt(
  sessionId: string,
): UseMutationResult<{ ok: boolean }, Error, SystemPromptIntent> {
  const client = useApiClient();

  return useMutation({
    // WI-373: the client sends a typed intent token; the server resolves the
    // canonical system-prompt text. No client-authored system-role content.
    mutationFn: async (intent: SystemPromptIntent) => {
      const res = await client.sessions[':sessionId']['system-prompt'].$post({
        param: { sessionId },
        json: intent,
      });
      await assertOk(res);
      return parseJson(
        res,
        z.object({ ok: z.boolean() }),
        'POST /sessions/:sessionId/system-prompt',
      );
    },
  });
}

export function useRecordSessionEvent(
  sessionId: string,
): UseMutationResult<{ ok: boolean }, Error, SessionAnalyticsEventInput> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: SessionAnalyticsEventInput) => {
      const res = await client.sessions[':sessionId'].events.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        z.object({ ok: z.boolean() }),
        'POST /sessions/:sessionId/events',
      );
    },
  });
}

export function useFlagSessionContent(
  sessionId: string,
): UseMutationResult<{ message: string }, Error, ContentFlagInput> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: ContentFlagInput) => {
      const res = await client.sessions[':sessionId'].flag.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        z.object({ message: z.string() }),
        'POST /sessions/:sessionId/flag',
      );
    },
  });
}

export function useParkingLot(
  sessionId: string,
): UseQueryResult<ParkingLotItem[]> {
  const client = useApiClient();
  const { mode, profileId } = useSessionNavigationScope();

  return useApiQuery<{ items: ParkingLotItem[] }, ParkingLotItem[]>({
    queryKey: queryKeys.sessions.parkingLot(mode, sessionId, profileId),
    schema: parkingLotItemsResponseSchema,
    fetch: (signal) =>
      client.sessions[':sessionId']['parking-lot'].$get(
        { param: { sessionId } },
        { init: { signal } },
      ),
    select: (json) => json.items,
    enabled: !!sessionId,
  });
}

export function useTopicParkingLot(
  subjectId: string,
  topicId: string,
): UseQueryResult<ParkingLotItem[]> {
  const client = useApiClient();
  const { mode, profileId } = useSessionNavigationScope();

  return useApiQuery<{ items: ParkingLotItem[] }, ParkingLotItem[]>({
    queryKey: queryKeys.sessions.topicParkingLot(
      mode,
      subjectId,
      topicId,
      profileId,
    ),
    schema: parkingLotItemsResponseSchema,
    fetch: (signal) =>
      client.subjects[':subjectId'].topics[':topicId']['parking-lot'].$get(
        { param: { subjectId, topicId } },
        { init: { signal } },
      ),
    select: (json) => json.items,
    enabled: !!subjectId && !!topicId,
  });
}

export function useAddParkingLotItem(
  sessionId: string,
): UseMutationResult<{ item: ParkingLotItem }, Error, { question: string }> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { mode, profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async (input: { question: string }) => {
      const res = await client.sessions[':sessionId']['parking-lot'].$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        parkingLotAddResponseSchema,
        'POST /sessions/:sessionId/parking-lot',
      );
    },
    onSuccess: () => {
      // [BUG-165] Scope invalidation to the active profile so a mutation on
      // this profile cannot touch another profile's parking-lot cache on a
      // shared device. Mirrors the queryKeys.sessions.parkingLot factory.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.parkingLot(mode, sessionId, profileId),
      });
    },
  });
}

export function useSessionSummary(
  sessionId: string,
  options?: {
    refetchInterval?: (
      data: SessionSummary | null | undefined,
    ) => number | false;
  },
): UseQueryResult<SessionSummary | null> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSessionNavigationScope();

  return useQuery({
    queryKey: queryKeys.sessions.summary(mode, sessionId, profileId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId'].summary.$get(
          { param: { sessionId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await parseJson(
          res,
          sessionSummaryGetResponseSchema,
          'GET /sessions/:sessionId/summary',
        );
        return data.summary;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
    refetchInterval: options?.refetchInterval
      ? (query) => options.refetchInterval?.(query.state.data ?? null) ?? false
      : undefined,
  });
}

export function useSubmitSummary(
  sessionId: string,
): UseMutationResult<
  SubmitSummaryResult,
  Error,
  { content: string; signal?: AbortSignal }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async (input: { content: string; signal?: AbortSignal }) => {
      const { signal, cleanup } = combinedSignal(
        input.signal,
        SUBMIT_SUMMARY_TIMEOUT_MS,
      );
      try {
        const res = await client.sessions[':sessionId'].summary.$post(
          {
            param: { sessionId },
            json: { content: input.content },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return parseJson(
          res,
          submitSummaryResultSchema,
          'POST /sessions/:sessionId/summary',
        );
      } finally {
        cleanup();
      }
    },
    onMutate: (): SessionDerivedMutationContext => ({ profileId }),
    onSuccess: (_data, _variables, mutationContext) => {
      const mutationProfileId = mutationContext?.profileId;
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchSummaryAnyMode(
            sessionId,
            mutationProfileId,
          )(query.queryKey),
      });
      invalidateSessionDerivedQueries(queryClient);
      invalidateSessionHistoryQueries(queryClient, mutationProfileId);
    },
  });
}

export function useRetrySummaryFeedback(
  sessionId: string,
): UseMutationResult<RetrySummaryFeedbackResult, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async () => {
      const { signal, cleanup } = createTimeoutSignal(15_000);
      try {
        const res = await client.sessions[':sessionId'].summary[
          'retry-feedback'
        ].$post({ param: { sessionId } }, { init: { signal } });
        await assertOk(res);
        return parseJson(
          res,
          retrySummaryFeedbackResultSchema,
          'POST /sessions/:sessionId/summary/retry-feedback',
        );
      } finally {
        cleanup();
      }
    },
    onMutate: (): SessionDerivedMutationContext => ({ profileId }),
    onSuccess: (_data, _variables, mutationContext) => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchSummaryAnyMode(
            sessionId,
            mutationContext?.profileId,
          )(query.queryKey),
      });
    },
  });
}

export function useSkipSummary(
  sessionId: string,
): UseMutationResult<SkipSummaryResponse, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async () => {
      const res = await client.sessions[':sessionId'].summary.skip.$post({
        param: { sessionId },
      });
      await assertOk(res);
      return parseJson(
        res,
        skipSummaryResponseSchema,
        'POST /sessions/:sessionId/summary/skip',
      );
    },
    onMutate: (): SessionDerivedMutationContext => ({ profileId }),
    onSuccess: (_data, _variables, mutationContext) => {
      const mutationProfileId = mutationContext?.profileId;
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchSummaryAnyMode(
            sessionId,
            mutationProfileId,
          )(query.queryKey),
      });
      invalidateSessionDerivedQueries(queryClient);
      invalidateSessionHistoryQueries(queryClient, mutationProfileId);
    },
  });
}

export function useRecallBridge(
  sessionId: string,
): UseMutationResult<RecallBridgeResult, Error, void> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<RecallBridgeResult> => {
      const res = await client.sessions[':sessionId']['recall-bridge'].$post({
        param: { sessionId },
      });
      await assertOk(res);
      return parseJson(
        res,
        recallBridgeResultSchema,
        'POST /sessions/:sessionId/recall-bridge',
      );
    },
  });
}
