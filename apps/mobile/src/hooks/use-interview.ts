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
  ExtractedInterviewSignals,
  InterviewState,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import {
  withIdempotencyKey,
  type IdempotencyReplayBody,
} from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { getApiUrl } from '../lib/api';
import { streamSSEViaXHR } from '../lib/sse';
import type { StreamFallbackReason } from '../lib/sse';

// InterviewResponse is API-route-specific (includes exchangeCount, not extractedSignals)
interface InterviewResponse {
  response: string;
  isComplete: boolean;
  exchangeCount: number;
}

export function useInterviewState(
  subjectId: string,
  options?: { enabled?: boolean }
): UseQueryResult<InterviewState | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  // [BUG-810] Always AND with the internal sanity check so callers can pass
  // `{ enabled: !!safeSubjectId }` without losing the !!activeProfile guard.
  // A previous shape allowed empty-string subjectIds through, producing a
  // GET /subjects//interview call → 404 + Sentry noise on every onboarding load.
  const callerEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: ['interview', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].interview.$get(
          { param: { subjectId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = await res.json();
        return data.state;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && callerEnabled,
    refetchInterval: (query) =>
      query.state.data?.status === 'completing' ? 3_000 : false,
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
// [BUG-464] Force-complete mutation — client escape button
// ---------------------------------------------------------------------------

// Force-complete returns the extracted signals alongside completion so the
// caller can route into the interests-context picker without an extra round
// trip. `extractedSignals` is optional — absent when the draft was already
// completed without persisted signals (legacy drafts predating BKT-C.2).
export interface ForceCompleteInterviewResponse {
  isComplete: boolean;
  exchangeCount: number;
  extractedSignals?: ExtractedInterviewSignals;
}

export function useForceCompleteInterview(
  subjectId: string,
  bookId?: string
): UseMutationResult<ForceCompleteInterviewResponse, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.subjects[':subjectId'].interview.complete.$post({
        param: { subjectId },
        ...(bookId ? { query: { bookId } } : {}),
      });
      await assertOk(res);
      return (await res.json()) as ForceCompleteInterviewResponse;
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
  fallback?: {
    reason: StreamFallbackReason;
    fallbackText: string;
  };
}

export function useStreamInterviewMessage(
  subjectId: string,
  bookId?: string
): {
  stream: (
    message: string,
    onChunk: (accumulated: string) => void,
    onDone: (result: InterviewStreamDoneResult) => void,
    options?: {
      idempotencyKey?: string;
      onReplay?: (result: IdempotencyReplayBody) => void;
    }
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
  const bookIdRef = useRef(bookId);
  getTokenRef.current = getToken;
  profileIdRef.current = activeProfile?.id;
  subjectIdRef.current = subjectId;
  bookIdRef.current = bookId;

  const stream = useCallback(
    async (
      message: string,
      onChunk: (accumulated: string) => void,
      onDone: (result: InterviewStreamDoneResult) => void,
      options?: {
        idempotencyKey?: string;
        onReplay?: (result: IdempotencyReplayBody) => void;
      }
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
        const finalHeaders = withIdempotencyKey(
          headers,
          options?.idempotencyKey
        );

        const url = `${getApiUrl()}/v1/subjects/${effectiveSubjectId}/interview/stream${
          bookIdRef.current ? `?bookId=${bookIdRef.current}` : ''
        }`;
        const { events, abort } = streamSSEViaXHR(url, {
          method: 'POST',
          headers: finalHeaders,
          body: JSON.stringify({ message }),
        });
        abortRef.current = abort;

        let accumulated = '';
        let fallback:
          | { reason: StreamFallbackReason; fallbackText: string }
          | undefined;
        for await (const event of events) {
          if (event.type === 'chunk') {
            accumulated += event.content;
            onChunk(accumulated);
          } else if (event.type === 'replace') {
            accumulated = event.content;
            onChunk(accumulated);
          } else if (event.type === 'fallback') {
            fallback = {
              reason: event.reason,
              fallbackText: event.fallbackText,
            };
          } else if (event.type === 'replay') {
            options?.onReplay?.(event);
            return;
          } else if (event.type === 'done') {
            onDone({
              isComplete: event.isComplete ?? false,
              exchangeCount: event.exchangeCount,
              fallback,
            });
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      } finally {
        if (isStreamingRef.current) {
          abortRef.current?.();
        }
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

// ---------------------------------------------------------------------------
// Durability layer: polling helpers and retry-persist mutation
// ---------------------------------------------------------------------------

const POLL_BACKOFF_MS = [3_000, 6_000, 12_000, 30_000];

/**
 * Returns a React Query `refetchInterval` value (ms or false) for a draft that
 * is in the `completing` state. Uses exponential back-off to avoid hammering
 * the API while Inngest processes the persist job.
 *
 * Pass `pollAttempt` (number of polls so far) to walk through the back-off
 * ladder. Pass `appActive` (from AppState or useFocusEffect) so polling halts
 * when the app is backgrounded.
 */
export function computeInterviewRefetchInterval(
  status: string | undefined | null,
  pollAttempt: number,
  appActive: boolean
): number | false {
  if (status !== 'completing' || !appActive) return false;
  const idx = Math.min(pollAttempt, POLL_BACKOFF_MS.length - 1);
  return POLL_BACKOFF_MS[idx] as number;
}

/**
 * Fires the retry-persist endpoint so the server re-queues the Inngest job
 * when the initial persist run failed. Invalidates the interview query on
 * success so the screen re-polls for the updated status.
 */
export function useRetryInterviewPersist(): UseMutationResult<
  { status: string },
  Error,
  { subjectId: string; bookId?: string }
> {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subjectId,
      bookId,
    }: {
      subjectId: string;
      bookId?: string;
    }) => {
      const token = await getToken();
      const query = bookId ? `?bookId=${bookId}` : '';
      const res = await fetch(
        `${getApiUrl()}/v1/subjects/${subjectId}/interview/retry-persist${query}`,
        {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(activeProfile?.id ? { 'X-Profile-Id': activeProfile.id } : {}),
          },
        }
      );
      if (!res.ok) throw new Error(`Retry failed: ${res.status}`);
      return (await res.json()) as { status: string };
    },
    onSuccess: (_, { subjectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['interview', subjectId],
      });
    },
  });
}
