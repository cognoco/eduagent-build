import { useState, useCallback, useRef } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import type { LearningSession, SessionSummary } from '@eduagent/schemas';
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
}

interface CloseResult {
  message: string;
  sessionId: string;
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

export function useStartSession(
  subjectId: string
): UseMutationResult<
  SessionStartResult,
  Error,
  { subjectId: string; topicId?: string; sessionType?: 'learning' | 'homework' }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      subjectId: string;
      topicId?: string;
      sessionType?: 'learning' | 'homework';
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

export function useCloseSession(
  sessionId: string
): UseMutationResult<CloseResult, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.sessions[':sessionId'].close.$post({
        param: { sessionId },
        json: {},
      });
      await assertOk(res);
      return (await res.json()) as CloseResult;
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
    onDone: (result: { exchangeCount: number; escalationRung: number }) => void,
    overrideSessionId?: string
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
      }) => void,
      overrideSessionId?: string
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
        const { events, abort } = streamSSEViaXHR(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ message }),
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
