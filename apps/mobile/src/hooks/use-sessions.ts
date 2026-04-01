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
  HomeworkSessionMetadata,
  LearningSession,
  SessionMessageInput,
  SessionMetadata,
  SessionSummary,
  SessionTranscript,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { getApiUrl } from '../lib/api';
import { streamSSEViaXHR } from '../lib/sse';

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
  shouldPromptCasualSwitch?: boolean;
}

export function useStartSession(subjectId: string): UseMutationResult<
  SessionStartResult,
  Error,
  {
    subjectId: string;
    topicId?: string;
    sessionType?: 'learning' | 'homework';
    metadata?: SessionMetadata;
  }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      subjectId: string;
      topicId?: string;
      sessionType?: 'learning' | 'homework';
      metadata?: SessionMetadata;
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
    milestonesReached?: string[];
  }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input = {}) => {
      const res = await client.sessions[':sessionId'].close.$post({
        param: { sessionId },
        json: input,
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
    }) => void,
    overrideSessionId?: string,
    options?: { homeworkMode?: 'help_me' | 'check_answer' }
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
      }) => void,
      overrideSessionId?: string,
      options?: { homeworkMode?: 'help_me' | 'check_answer' }
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
              escalationRung: event.escalationRung,
              expectedResponseMinutes: (
                event as { expectedResponseMinutes?: number }
              ).expectedResponseMinutes,
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
        const transcriptClient = (
          client.sessions[':sessionId'] as Record<string, any>
        )['transcript'];
        const res = await transcriptClient.$get({
          param: { sessionId },
          init: { signal },
        } as never);
        await assertOk(res);
        return (await res.json()) as SessionTranscript;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
  });
}

export function useRecordSystemPrompt(
  sessionId: string
): UseMutationResult<{ ok: boolean }, Error, { content: string }> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      const systemPromptClient = (
        client.sessions[':sessionId'] as Record<string, any>
      )['system-prompt'];
      const res = await systemPromptClient.$post({
        param: { sessionId },
        json: { content },
      });
      await assertOk(res);
      return (await res.json()) as { ok: boolean };
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
        const res = await client.sessions[':sessionId'].summary.$get({
          param: { sessionId },
          init: { signal },
        } as never);
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
      const summaryClient = (
        client.sessions[':sessionId'] as Record<string, any>
      )['summary'];
      const res = await summaryClient.skip.$post({
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
