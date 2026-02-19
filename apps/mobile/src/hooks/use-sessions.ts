import { useState, useCallback, useRef } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { LearningSession, SessionSummary } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { parseSSEStream } from '../lib/sse';

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
      return await res.json();
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
      return await res.json();
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
  const client = useApiClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

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
        const res = await client.sessions[':sessionId'].stream.$post({
          param: { sessionId: effectiveSessionId },
          json: { message },
        });

        let accumulated = '';
        for await (const event of parseSSEStream(res as unknown as Response)) {
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
        isStreamingRef.current = false;
        setIsStreaming(false);
      }
    },
    [client]
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
    queryFn: async () => {
      const res = await client.sessions[':sessionId'].summary.$get({
        param: { sessionId },
      });
      const data = await res.json();
      return data.summary;
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
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['session-summary', sessionId],
      });
    },
  });
}
