import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@clerk/expo';
import type {
  ChallengeRoundSessionState,
  SessionMessageInput,
} from '@eduagent/schemas';
import {
  getProxyMode,
  withIdempotencyKey,
  type IdempotencyReplayBody,
} from '../lib/api-client';
import { getApiUrl } from '../lib/api';
import { NetworkError, UpstreamError } from '../lib/api-errors';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import { useProfile } from '../lib/profile';
import {
  streamSSEViaXHR,
  type ChallengeRoundOfferEvent,
  type DraftedChallengeNoteEvent,
  type FluencyDrillEvent,
  type LanguageLearningActivityEvent,
  type StreamFallbackReason,
} from '../lib/sse';

type StreamMessageDoneResult = {
  exchangeCount: number;
  escalationRung: number;
  expectedResponseMinutes?: number;
  aiEventId?: string;
  notePrompt?: boolean;
  notePromptPostSession?: boolean;
  fluencyDrill?: FluencyDrillEvent;
  languageLearning?: LanguageLearningActivityEvent;
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
            // [WI-2220] Active app shell — lets production app-help prompt
            // composition answer from the correct destination map instead of
            // silently defaulting to V0 for V2 clients.
            shell: FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? 'v2' : 'v0',
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
                    languageLearning: event.languageLearning,
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
