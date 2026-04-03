import { useState, useCallback, useRef } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import type { InterviewState } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { getApiUrl } from '../lib/api';
import { streamSSEViaXHR } from '../lib/sse';

// InterviewResponse is API-route-specific (includes exchangeCount, not extractedSignals)
interface InterviewResponse {
  response: string;
  isComplete: boolean;
  exchangeCount: number;
}

export function useInterviewState(
  subjectId: string
): UseQueryResult<InterviewState | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['interview', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].interview.$get({
          param: { subjectId },
          init: { signal },
        } as never);
        await assertOk(res);
        const data = await res.json();
        return data.state;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useSendInterviewMessage(
  subjectId: string
): UseMutationResult<InterviewResponse, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string): Promise<InterviewResponse> => {
      const res = await client.subjects[':subjectId'].interview.$post({
        param: { subjectId },
        json: { message },
      });
      await assertOk(res);
      return (await res.json()) as InterviewResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['interview', subjectId],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// SSE streaming hook for interview messages (FR14)
// ---------------------------------------------------------------------------

interface InterviewStreamDoneResult {
  isComplete: boolean;
  exchangeCount: number;
}

export function useStreamInterviewMessage(subjectId: string): {
  stream: (
    message: string,
    onChunk: (accumulated: string) => void,
    onDone: (result: InterviewStreamDoneResult) => void
  ) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
} {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const abortRef = useRef<(() => void) | null>(null);

  // Refs for auth values — avoid stale closures in the callback
  const getTokenRef = useRef(getToken);
  const profileIdRef = useRef(activeProfile?.id);
  const subjectIdRef = useRef(subjectId);
  getTokenRef.current = getToken;
  profileIdRef.current = activeProfile?.id;
  subjectIdRef.current = subjectId;

  const stream = useCallback(
    async (
      message: string,
      onChunk: (accumulated: string) => void,
      onDone: (result: InterviewStreamDoneResult) => void
    ): Promise<void> => {
      const effectiveSubjectId = subjectIdRef.current;
      if (isStreamingRef.current || !effectiveSubjectId) return;
      isStreamingRef.current = true;
      setIsStreaming(true);

      try {
        const token = await getTokenRef.current();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (profileIdRef.current)
          headers['X-Profile-Id'] = profileIdRef.current;

        const url = `${getApiUrl()}/v1/subjects/${effectiveSubjectId}/interview/stream`;
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
            const doneEvent = event as unknown as InterviewStreamDoneResult;
            onDone({
              isComplete: doneEvent.isComplete,
              exchangeCount: doneEvent.exchangeCount,
            });
          }
        }
      } finally {
        abortRef.current?.();
        abortRef.current = null;
        isStreamingRef.current = false;
        setIsStreaming(false);
        void queryClient.invalidateQueries({
          queryKey: ['interview', subjectIdRef.current],
        });
      }
    },
    // all mutable values accessed via refs to avoid stale closures
    [queryClient]
  );

  const abort = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  return { stream, abort, isStreaming };
}
