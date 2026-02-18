import { useState, useCallback } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { useApi } from '../lib/auth-api';
import { getApiUrl } from '../lib/api';
import { useProfile } from '../lib/profile';
import { streamSSE } from '../lib/sse';

interface SessionStartResult {
  session: {
    id: string;
    subjectId: string;
    sessionType: string;
    status: string;
    escalationRung: number;
    exchangeCount: number;
    startedAt: string;
    lastActivityAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
  };
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

interface SessionSummaryResult {
  id: string;
  sessionId: string;
  content: string;
  aiFeedback: string | null;
  status: string;
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
  { subjectId: string; topicId?: string }
> {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { subjectId: string; topicId?: string }) =>
      post<SessionStartResult>(`/subjects/${subjectId}/sessions`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useSendMessage(
  sessionId: string
): UseMutationResult<MessageResult, Error, { message: string }> {
  const { post } = useApi();

  return useMutation({
    mutationFn: (input: { message: string }) =>
      post<MessageResult>(`/sessions/${sessionId}/messages`, input),
  });
}

export function useCloseSession(
  sessionId: string
): UseMutationResult<CloseResult, Error, void> {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => post<CloseResult>(`/sessions/${sessionId}/close`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useStreamMessage(sessionId: string): {
  stream: (
    message: string,
    onChunk: (accumulated: string) => void,
    onDone: (result: { exchangeCount: number; escalationRung: number }) => void
  ) => Promise<void>;
  isStreaming: boolean;
} {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const [isStreaming, setIsStreaming] = useState(false);

  const stream = useCallback(
    async (
      message: string,
      onChunk: (accumulated: string) => void,
      onDone: (result: {
        exchangeCount: number;
        escalationRung: number;
      }) => void
    ): Promise<void> => {
      if (isStreaming || !sessionId) return;
      setIsStreaming(true);

      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (activeProfile?.id) headers['X-Profile-Id'] = activeProfile.id;

        const baseUrl = getApiUrl();
        const url = `${baseUrl}/v1/sessions/${sessionId}/stream`;

        let accumulated = '';
        for await (const event of streamSSE(url, { message }, headers)) {
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
        setIsStreaming(false);
      }
    },
    [sessionId, isStreaming, getToken, activeProfile?.id]
  );

  return { stream, isStreaming };
}

export function useSessionSummary(
  sessionId: string
): UseQueryResult<SessionSummaryResult | null> {
  const { get } = useApi();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['session-summary', sessionId, activeProfile?.id],
    queryFn: async () => {
      const data = await get<{ summary: SessionSummaryResult | null }>(
        `/sessions/${sessionId}/summary`
      );
      return data.summary;
    },
    enabled: !!activeProfile && !!sessionId,
  });
}

export function useSubmitSummary(
  sessionId: string
): UseMutationResult<SubmitSummaryResult, Error, { content: string }> {
  const { post } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { content: string }) =>
      post<SubmitSummaryResult>(`/sessions/${sessionId}/summary`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['session-summary', sessionId],
      });
    },
  });
}
