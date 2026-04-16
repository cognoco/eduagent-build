import { useState, useCallback, useRef } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import type {
  CelebrationReason,
  ContentFlagInput,
  HomeworkSessionMetadata,
  InputMode,
  LearningSession,
  ParkingLotItem,
  SessionMessageInput,
  SessionMetadata,
  SessionAnalyticsEventInput,
  SessionSummary,
  SessionTranscript,
  SessionType,
  RecallBridgeResult,
  VerificationType,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { getApiUrl } from '../lib/api';
import { streamSSEViaXHR, type FluencyDrillEvent } from '../lib/sse';

// API-route-specific response wrappers (not in schemas)
interface SessionStartResult {
  session: LearningSession;
}

interface MessageResult {
  response: string;
  escalationRung: number;
  isUnderstandingCheck: boolean;
  exchangeCount: number;
  expectedResponseMinutes: number;
  aiEventId?: string;
}

interface CloseResult {
  message: string;
  sessionId: string;
  wallClockSeconds: number;
  summaryStatus?:
    | 'pending'
    | 'submitted'
    | 'accepted'
    | 'skipped'
    | 'auto_closed';
  shouldPromptCasualSwitch?: boolean;
}

interface SubmitSummaryResult {
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string;
    status: 'accepted' | 'submitted';
  };
}

interface SkipSummaryResult {
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'skipped' | 'submitted' | 'accepted';
  };
  shouldWarnSummarySkip?: boolean;
  shouldPromptCasualSwitch?: boolean;
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
      return (await res.json()) as SessionStartResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useSetSessionInputMode(
  sessionId: string
): UseMutationResult<SessionStartResult, Error, { inputMode: InputMode }> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { inputMode: InputMode }) => {
      // Hono RPC cannot index hyphenated path segments as JS identifiers.
      // Narrow cast to preserve type intent — update if the API route changes.
      // Route ref: apps/api/src/routes/sessions.ts POST /sessions/:sessionId/input-mode
      const inputModeClient = (
        client.sessions[':sessionId'] as unknown as {
          'input-mode': {
            $post: (args: {
              param: { sessionId: string };
              json: { inputMode: InputMode };
            }) => Promise<Response>;
          };
        }
      )['input-mode'];
      const res = await inputModeClient.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as SessionStartResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['session-transcript', sessionId],
      });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useSyncHomeworkState(
  sessionId: string
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
      return (await res.json()) as { metadata: HomeworkSessionMetadata };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useSendMessage(
  sessionId: string
): UseMutationResult<MessageResult, Error, { message: string }> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: { message: string }) => {
      const res = await client.sessions[':sessionId'].messages.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as MessageResult;
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
      return (await res.json()) as unknown as CloseResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useStreamMessage(sessionId: string): {
  stream: (
    message: string,
    onChunk: (accumulated: string) => void,
    onDone: (result: {
      exchangeCount: number;
      escalationRung: number;
      expectedResponseMinutes?: number;
      aiEventId?: string;
      notePrompt?: boolean;
      notePromptPostSession?: boolean;
      fluencyDrill?: FluencyDrillEvent;
    }) => void,
    overrideSessionId?: string,
    options?: {
      homeworkMode?: 'help_me' | 'check_answer';
      imageBase64?: string;
      imageMimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
    }
  ) => Promise<void>;
  isStreaming: boolean;
} {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
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
      onDone: (result: {
        exchangeCount: number;
        escalationRung: number;
        expectedResponseMinutes?: number;
        aiEventId?: string;
        notePrompt?: boolean;
        notePromptPostSession?: boolean;
        fluencyDrill?: FluencyDrillEvent;
      }) => void,
      overrideSessionId?: string,
      options?: {
        homeworkMode?: 'help_me' | 'check_answer';
        imageBase64?: string;
        imageMimeType?: string;
      }
    ): Promise<void> => {
      const effectiveSessionId = overrideSessionId ?? sessionIdRef.current;
      if (isStreamingRef.current || !effectiveSessionId) return;
      isStreamingRef.current = true;
      setIsStreaming(true);

      try {
        // Build URL and auth headers manually — React Native's fetch does NOT
        // support ReadableStream on response.body (Hermes returns null), so we
        // bypass the Hono RPC client and use XHR-based streaming instead.
        const token = await getTokenRef.current();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (profileIdRef.current)
          headers['X-Profile-Id'] = profileIdRef.current;

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
        const { events, abort } = streamSSEViaXHR(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        abortRef.current = abort;

        let accumulated = '';
        for await (const event of events) {
          if (event.type === 'chunk') {
            accumulated += event.content;
            onChunk(accumulated);
          } else if (event.type === 'done') {
            onDone({
              exchangeCount: event.exchangeCount,
              escalationRung: event.escalationRung ?? 0,
              expectedResponseMinutes: event.expectedResponseMinutes,
              aiEventId: (event as { aiEventId?: string }).aiEventId,
              notePrompt: event.notePrompt,
              notePromptPostSession: event.notePromptPostSession,
              fluencyDrill: event.fluencyDrill,
            });
          }
        }
      } finally {
        // Abort any in-flight XHR — safe to call even after normal completion
        abortRef.current?.();
        abortRef.current = null;
        isStreamingRef.current = false;
        setIsStreaming(false);
      }
    },

    // all mutable values accessed via refs (sessionIdRef, getTokenRef,
    // profileIdRef, abortRef) to avoid stale closures.
    []
  );

  return { stream, isStreaming };
}

export function useSessionTranscript(
  sessionId: string
): UseQueryResult<SessionTranscript | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['session-transcript', sessionId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId'].transcript.$get(
          { param: { sessionId } },
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as SessionTranscript;
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

export function useRecordSystemPrompt(
  sessionId: string
): UseMutationResult<
  { ok: boolean },
  Error,
  { content: string; metadata?: Record<string, unknown> }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async ({
      content,
      metadata,
    }: {
      content: string;
      metadata?: Record<string, unknown>;
    }) => {
      const res = await client.sessions[':sessionId']['system-prompt'].$post({
        param: { sessionId },
        json: { content, metadata },
      });
      await assertOk(res);
      return (await res.json()) as { ok: boolean };
    },
  });
}

export function useRecordSessionEvent(
  sessionId: string
): UseMutationResult<{ ok: boolean }, Error, SessionAnalyticsEventInput> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: SessionAnalyticsEventInput) => {
      const res = await client.sessions[':sessionId'].events.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as { ok: boolean };
    },
  });
}

export function useFlagSessionContent(
  sessionId: string
): UseMutationResult<{ message: string }, Error, ContentFlagInput> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: ContentFlagInput) => {
      const res = await client.sessions[':sessionId'].flag.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as { message: string };
    },
  });
}

export function useParkingLot(
  sessionId: string
): UseQueryResult<ParkingLotItem[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['parking-lot', sessionId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId']['parking-lot'].$get(
          { param: { sessionId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { items: ParkingLotItem[] };
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
  topicId: string
): UseQueryResult<ParkingLotItem[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['parking-lot', 'topic', subjectId, topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[':topicId'][
          'parking-lot'
        ].$get({ param: { subjectId, topicId } }, { init: { signal } });
        await assertOk(res);
        const data = (await res.json()) as { items: ParkingLotItem[] };
        return data.items;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}

export function useAddParkingLotItem(
  sessionId: string
): UseMutationResult<{ item: ParkingLotItem }, Error, { question: string }> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { question: string }) => {
      const res = await client.sessions[':sessionId']['parking-lot'].$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as { item: ParkingLotItem };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['parking-lot', sessionId],
      });
    },
  });
}

export function useSessionSummary(
  sessionId: string
): UseQueryResult<SessionSummary | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['session-summary', sessionId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId'].summary.$get(
          { param: { sessionId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = await res.json();
        return data.summary;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
  });
}

export function useSubmitSummary(
  sessionId: string
): UseMutationResult<SubmitSummaryResult, Error, { content: string }> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { content: string }) => {
      const res = await client.sessions[':sessionId'].summary.$post({
        param: { sessionId },
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as SubmitSummaryResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['session-summary', sessionId],
      });
    },
  });
}

export function useSkipSummary(
  sessionId: string
): UseMutationResult<SkipSummaryResult, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.sessions[':sessionId'].summary.skip.$post({
        param: { sessionId },
      });
      await assertOk(res);
      return (await res.json()) as SkipSummaryResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['session-summary', sessionId],
      });
    },
  });
}

export function useRecallBridge(
  sessionId: string
): UseMutationResult<RecallBridgeResult, Error, void> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<RecallBridgeResult> => {
      const res = await client.sessions[':sessionId']['recall-bridge'].$post({
        param: { sessionId },
      });
      await assertOk(res);
      return (await res.json()) as RecallBridgeResult;
    },
  });
}
