import { useState, useCallback, useRef } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { transcriptResponseSchema } from '@eduagent/schemas';
import type {
  CelebrationReason,
  CloseResult,
  ContentFlagInput,
  HomeworkSessionMetadata,
  InputMode,
  LearningSession,
  MessageResult,
  ParkingLotItem,
  SessionMessageInput,
  SessionMetadata,
  SessionAnalyticsEventInput,
  SessionStartResult,
  SessionSummary,
  SkipSummaryResponse,
  SubmitSummaryResult,
  TranscriptResponse,
  SessionType,
  RecallBridgeResult,
  VerificationType,
  SystemPromptIntent,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';
import {
  closeResultSchema,
  homeworkStateSyncResponseSchema,
  messageResultSchema,
  parkingLotAddResponseSchema,
  parkingLotItemSchema,
  recallBridgeResultSchema,
  sessionStartResultSchema,
  sessionSummaryGetResponseSchema,
  skipSummaryResponseSchema,
  submitSummaryResultSchema,
} from '@eduagent/schemas';
import { z } from 'zod';
import {
  useApiClient,
  getProxyMode,
  withIdempotencyKey,
  type IdempotencyReplayBody,
} from '../lib/api-client';
import { parseJson } from '../lib/parse-json';
import { useProfile } from '../lib/profile';
import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { getApiUrl } from '../lib/api';
import { NetworkError, UpstreamError } from '../lib/api-errors';
import { queryKeys } from '../lib/query-keys';
import { useNavigationDataScopeContract } from './use-navigation-contract';
import {
  streamSSEViaXHR,
  type ChallengeRoundOfferEvent,
  type DraftedChallengeNoteEvent,
  type FluencyDrillEvent,
  type StreamFallbackReason,
} from '../lib/sse';

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

export function computeFilingRefetchInterval(
  filingStatus: FilingStatus,
): number | false {
  return filingStatus === 'filing_pending' ? 15_000 : false;
}

type StreamMessageDoneResult = {
  exchangeCount: number;
  escalationRung: number;
  expectedResponseMinutes?: number;
  aiEventId?: string;
  notePrompt?: boolean;
  notePromptPostSession?: boolean;
  fluencyDrill?: FluencyDrillEvent;
  challengeRound?: ChallengeRoundSessionState;
  challengeOffer?: ChallengeRoundOfferEvent;
  draftedNote?: DraftedChallengeNoteEvent;
  confidence?: 'low' | 'medium' | 'high';
  fallback?: {
    reason: StreamFallbackReason;
    fallbackText: string;
  };
};

function isRetryablePreStreamError(error: unknown): boolean {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : undefined;
  if (status !== undefined) {
    return status >= 500;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'isTimeout' in error &&
    (error as { isTimeout?: unknown }).isTimeout === true
  ) {
    return true;
  }

  if (!(error instanceof Error)) return false;
  return (
    error.name === 'NetworkError' ||
    error.name === 'UpstreamError' ||
    error.name === 'TypeError' ||
    error.name === 'AbortError'
  );
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
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchAnyMode(sessionId, profileId)(query.queryKey),
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
    onSuccess: () => {
      invalidateSessionDerivedQueries(queryClient);
    },
  });
}

export function useStreamMessage(sessionId: string): {
  stream: (
    message: string,
    onChunk: (accumulated: string) => void,
    onDone: (result: StreamMessageDoneResult) => void | Promise<void>,
    overrideSessionId?: string,
    options?: {
      homeworkMode?: 'help_me' | 'check_answer';
      imageBase64?: string;
      imageMimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
      idempotencyKey?: string;
      onReplay?: (result: IdempotencyReplayBody) => void;
    },
  ) => Promise<void>;
  isStreaming: boolean;
} {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const activeStreamRef = useRef<Promise<void> | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Refs for auth values — avoid stale closures in the callback
  const getTokenRef = useRef(getToken);
  const profileIdRef = useRef(activeProfile?.id);
  getTokenRef.current = getToken;
  profileIdRef.current = activeProfile?.id;

  const stream = useCallback(
    async (
      message: string,
      onChunk: (accumulated: string) => void,
      onDone: (result: StreamMessageDoneResult) => void | Promise<void>,
      overrideSessionId?: string,
      options?: {
        homeworkMode?: 'help_me' | 'check_answer';
        imageBase64?: string;
        imageMimeType?: string;
        idempotencyKey?: string;
        onReplay?: (result: IdempotencyReplayBody) => void;
      },
    ): Promise<void> => {
      while (activeStreamRef.current) {
        await activeStreamRef.current.catch(() => undefined);
      }

      const effectiveSessionId = overrideSessionId ?? sessionIdRef.current;
      if (!effectiveSessionId) {
        throw new Error('Cannot stream a message without an active session.');
      }

      const runStream = (async (): Promise<void> => {
        isStreamingRef.current = true;
        setIsStreaming(true);
        try {
          // Build URL and auth headers manually — React Native's fetch does NOT
          // support ReadableStream on response.body (Hermes returns null), so we
          // bypass the Hono RPC client and use XHR-based streaming instead.
          // [I-1 / BUG-629] [I-3 / BUG-631] Snapshot BOTH proxyMode and
          // profileId BEFORE the async getToken() call so a concurrent
          // profile-switch can't produce a mismatched header pair.
          const proxyMode = getProxyMode();
          const snapshotProfileId = profileIdRef.current;
          const token = await getTokenRef.current();
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          if (snapshotProfileId) headers['X-Profile-Id'] = snapshotProfileId;
          // [I-1] SSE path builds headers manually so X-Proxy-Mode must be
          // injected here — customFetch is bypassed for the stream request.
          if (proxyMode) headers['X-Proxy-Mode'] = 'true';
          const finalHeaders = withIdempotencyKey(
            headers,
            options?.idempotencyKey,
          );

          const url = `${getApiUrl()}/v1/sessions/${effectiveSessionId}/stream`;
          const body: SessionMessageInput = {
            message,
            ...(options?.homeworkMode
              ? { homeworkMode: options.homeworkMode }
              : {}),
            ...(options?.imageBase64 && options?.imageMimeType
              ? {
                  imageBase64: options.imageBase64,
                  imageMimeType: options.imageMimeType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/webp',
                }
              : {}),
          };

          let retryCount = 0;
          while (true) {
            let sawStreamEvent = false;
            let terminalEventReceived = false;
            const { events, abort } = streamSSEViaXHR(url, {
              method: 'POST',
              headers: finalHeaders,
              body: JSON.stringify(body),
            });
            abortRef.current = abort;

            try {
              let accumulated = '';
              let fallback:
                | { reason: StreamFallbackReason; fallbackText: string }
                | undefined;
              for await (const event of events) {
                sawStreamEvent = true;
                if (event.type === 'chunk') {
                  accumulated += event.content;
                  onChunk(accumulated);
                } else if (event.type === 'replace') {
                  accumulated = event.content;
                  onChunk(accumulated);
                } else if (event.type === 'replay') {
                  terminalEventReceived = true;
                  options?.onReplay?.(event);
                  return;
                } else if (event.type === 'fallback') {
                  fallback = {
                    reason: event.reason,
                    fallbackText: event.fallbackText,
                  };
                } else if (event.type === 'done') {
                  terminalEventReceived = true;
                  await onDone({
                    exchangeCount: event.exchangeCount,
                    escalationRung: event.escalationRung ?? 0,
                    expectedResponseMinutes: event.expectedResponseMinutes,
                    aiEventId: (event as { aiEventId?: string }).aiEventId,
                    notePrompt: event.notePrompt,
                    notePromptPostSession: event.notePromptPostSession,
                    fluencyDrill: event.fluencyDrill,
                    challengeRound: event.challengeRound,
                    challengeOffer: event.challengeOffer,
                    draftedNote: event.draftedNote,
                    confidence: event.confidence,
                    fallback,
                  });
                } else if (event.type === 'error') {
                  throw new UpstreamError(
                    event.message,
                    event.code ?? 'UPSTREAM_ERROR',
                    502,
                  );
                }
              }

              if (!terminalEventReceived) {
                throw new NetworkError(
                  'The connection ended before a reply was received.',
                );
              }
              return;
            } catch (error) {
              if (
                retryCount < 1 &&
                !sawStreamEvent &&
                options?.idempotencyKey &&
                isRetryablePreStreamError(error)
              ) {
                retryCount += 1;
                continue;
              }
              throw error;
            } finally {
              if (!terminalEventReceived) {
                abortRef.current?.();
              }
              abortRef.current = null;
            }
          }
        } finally {
          abortRef.current = null;
          isStreamingRef.current = false;
          setIsStreaming(false);
        }
      })();
      activeStreamRef.current = runStream;

      try {
        await runStream;
      } finally {
        if (activeStreamRef.current === runStream) {
          activeStreamRef.current = null;
        }
      }
    },

    // all mutable values accessed via refs (sessionIdRef, getTokenRef,
    // profileIdRef, abortRef) to avoid stale closures.
    [],
  );

  return { stream, isStreaming };
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
    retry: (failureCount, error) => {
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
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
    retry: (failureCount, error) => {
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
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
  const { activeProfile, mode, profileId } = useSessionNavigationScope();

  return useQuery({
    queryKey: queryKeys.sessions.parkingLot(mode, sessionId, profileId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId']['parking-lot'].$get(
          { param: { sessionId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await parseJson(
          res,
          z.object({ items: z.array(parkingLotItemSchema) }),
          'GET /sessions/:sessionId/parking-lot',
        );
        return data.items;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
  });
}

export function useTopicParkingLot(
  subjectId: string,
  topicId: string,
): UseQueryResult<ParkingLotItem[]> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSessionNavigationScope();

  return useQuery({
    queryKey: queryKeys.sessions.topicParkingLot(
      mode,
      subjectId,
      topicId,
      profileId,
    ),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[':topicId'][
          'parking-lot'
        ].$get({ param: { subjectId, topicId } }, { init: { signal } });
        await assertOk(res);
        const data = await parseJson(
          res,
          z.object({ items: z.array(parkingLotItemSchema) }),
          'GET /subjects/:subjectId/topics/:topicId/parking-lot',
        );
        return data.items;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
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
): UseMutationResult<SubmitSummaryResult, Error, { content: string }> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSessionNavigationScope();

  return useMutation({
    mutationFn: async (input: { content: string }) => {
      const res = await client.sessions[':sessionId'].summary.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return parseJson(
        res,
        submitSummaryResultSchema,
        'POST /sessions/:sessionId/summary',
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchSummaryAnyMode(
            sessionId,
            profileId,
          )(query.queryKey),
      });
      invalidateSessionDerivedQueries(queryClient);
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
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchSummaryAnyMode(
            sessionId,
            profileId,
          )(query.queryKey),
      });
      invalidateSessionDerivedQueries(queryClient);
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
