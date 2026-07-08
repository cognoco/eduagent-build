import { useCallback, useEffect, useRef } from 'react';
import type {
  InputMode,
  PendingCelebration,
  HomeworkCaptureSource,
  HomeworkProblem,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';
import type {
  ChallengeRoundOfferEvent,
  DraftedChallengeNoteEvent,
  FluencyDrillEvent,
  LanguageLearningActivityEvent,
} from '../../lib/sse';
import type { ChatMessage } from './ChatShell';
import type {
  useStreamMessage,
  useStartSession,
  useRecordSystemPrompt,
} from '../../hooks/use-sessions';
import { useApiClient, type QuotaExceededDetails } from '../../lib/api-client';
import { assertOk } from '../../lib/assert-ok';
import { formatApiError } from '../../lib/format-api-error';
import { Sentry } from '../../lib/sentry';
import { writeSessionRecoveryMarker } from '../../lib/session-recovery';
import {
  buildHomeworkSessionMetadata,
  withProblemMode,
} from '../homework/problem-cards';
import { reportHomeworkMetadataSyncFailure } from './homework-metadata-telemetry';
import {
  celebrationForReason,
  type useMilestoneTracker,
} from '../../hooks/use-milestone-tracker';
import type { useCelebration } from '../../hooks/use-celebration';
import {
  computePaceMultiplier,
  isReconnectableSessionError,
  reconnectPromptForError,
} from './session-types';
import {
  beginAttempt,
  enqueue,
  getOutboxEntry,
  markConfirmed,
  recordFailure,
  type OutboxEntry,
} from '../../lib/message-outbox';

const FIRST_TOPIC_ACK_PATTERN =
  /^(ok(?:ay)?|yes|yep|yeah|ready|start|go ahead|sure|sounds good|let'?s go)[.!?\s]*$/i;

type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type SessionImageAttachment = {
  base64: string;
  mimeType: ImageMimeType;
};
export type ContinueMessageOptions = {
  sessionSubjectId?: string;
  sessionSubjectName?: string;
  existingEntry?: OutboxEntry;
  attachImage?: boolean;
  imageAttachment?: SessionImageAttachment;
};

function getStreamErrorCode(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function shouldCaptureLlmStreamError(error: unknown): boolean {
  const code = getStreamErrorCode(error);
  if (code === 'LLM_UNAVAILABLE' || code === 'UPSTREAM_ERROR') return true;
  return error instanceof Error && error.name === 'UpstreamError';
}

export function buildSessionApiMessage(
  text: string,
  opts: {
    effectiveMode: string;
    topicName?: string;
    messages: ChatMessage[];
  },
): string {
  const trimmed = text.trim();
  const isFirstLearnerTurn = !opts.messages.some(
    (message) => message.role === 'user' && !message.isAutoSent,
  );

  if (
    opts.effectiveMode === 'learning' &&
    opts.topicName &&
    isFirstLearnerTurn &&
    FIRST_TOPIC_ACK_PATTERN.test(trimmed)
  ) {
    return `I'm ready. Please start teaching me "${opts.topicName}" from the beginning.`;
  }

  return text;
}

export interface UseSessionStreamingOptions {
  // Route / derived params
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  effectiveSubjectId: string;
  effectiveSubjectName: string | undefined;
  effectiveMode: string;
  topicId: string | undefined;
  topicName: string | undefined;
  inputMode: InputMode;
  rawInput: string | undefined;
  resumeFromSessionId: string | undefined;
  gaps: string[] | undefined;
  verificationType: string | undefined; // 3E.1/3E.2: teach_back or evaluate
  normalizedOcrText: string | undefined;
  homeworkCaptureSource: HomeworkCaptureSource | undefined;

  // Message state
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setExchangeCount: React.Dispatch<React.SetStateAction<number>>;
  setEscalationRung: React.Dispatch<React.SetStateAction<number>>;
  setQuotaError: React.Dispatch<
    React.SetStateAction<QuotaExceededDetails | null>
  >;
  setNotePromptOffered: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNoteInput: React.Dispatch<React.SetStateAction<boolean>>;
  setResponseHistory: React.Dispatch<
    React.SetStateAction<
      Array<{ actualSeconds: number; expectedMinutes: number }>
    >
  >;
  setHomeworkProblemsState: React.Dispatch<
    React.SetStateAction<HomeworkProblem[]>
  >;
  setFluencyDrill: React.Dispatch<
    React.SetStateAction<FluencyDrillEvent | null>
  >;
  setLanguageLearning: React.Dispatch<
    React.SetStateAction<LanguageLearningActivityEvent | null>
  >;
  setChallengeRound: React.Dispatch<
    React.SetStateAction<ChallengeRoundSessionState | null>
  >;
  setChallengeOffer: React.Dispatch<
    React.SetStateAction<ChallengeRoundOfferEvent | null>
  >;
  setDraftedNote: React.Dispatch<
    React.SetStateAction<DraftedChallengeNoteEvent | null>
  >;
  /** F6: setter to track the last AI message ID that had confidence=low */
  setLowConfidenceMessageId: React.Dispatch<
    React.SetStateAction<string | null>
  >;

  // Homework state
  homeworkProblemsState: HomeworkProblem[];
  currentProblemIndex: number;
  activeHomeworkProblem: HomeworkProblem | undefined;
  homeworkMode: 'help_me' | 'check_answer' | undefined;

  // Subject state (for session recovery / reconnect classification)
  subjectId: string | undefined;
  classifiedSubject: { subjectId: string; subjectName: string } | null;

  // UI state
  isStreaming: boolean;
  sessionExpired: boolean;
  quotaError: QuotaExceededDetails | null;
  draftText: string;
  notePromptOffered: boolean;

  // Refs (passed directly so the hook doesn't create its own)
  animationCleanupRef: React.MutableRefObject<(() => void) | null>;
  silenceTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastAiAtRef: React.MutableRefObject<number | null>;
  lastExpectedMinutesRef: React.MutableRefObject<number>;
  lastRetryPayloadRef: React.MutableRefObject<{
    text: string;
    options?: ContinueMessageOptions;
    outboxEntryId?: string;
  } | null>;
  trackerStateRef: React.MutableRefObject<
    ReturnType<typeof useMilestoneTracker>['trackerState']
  >;
  /** Base64-encoded homework image to send with the first message (set once, cleared after send) */
  imageBase64Ref: React.MutableRefObject<string | null>;
  imageMimeTypeRef: React.MutableRefObject<ImageMimeType | null>;

  // Profile
  activeProfileId: string | undefined;

  // API / mutation hooks
  apiClient: ReturnType<typeof useApiClient>;
  startSession: ReturnType<typeof useStartSession>;
  streamMessage: ReturnType<typeof useStreamMessage>['stream'];
  recordSystemPrompt: ReturnType<typeof useRecordSystemPrompt>;

  // Milestone / celebration
  trackExchange: ReturnType<typeof useMilestoneTracker>['trackExchange'];
  trigger: ReturnType<typeof useCelebration>['trigger'];

  // Helpers
  createLocalMessageId: (prefix: 'user' | 'ai') => string;
  responseHistory: Array<{ actualSeconds: number; expectedMinutes: number }>;
}

export function useSessionStreaming(opts: UseSessionStreamingOptions) {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    activeSessionId,
    setActiveSessionId,
    effectiveSubjectId,
    effectiveSubjectName,
    effectiveMode,
    topicId,
    topicName,
    messages,
    inputMode,
    rawInput,
    resumeFromSessionId,
    gaps,
    verificationType,
    normalizedOcrText,
    homeworkCaptureSource,
    setMessages,
    setIsStreaming,
    setExchangeCount,
    setEscalationRung,
    setQuotaError,
    setNotePromptOffered,
    setShowNoteInput,
    setResponseHistory,
    setHomeworkProblemsState,
    setFluencyDrill,
    setLanguageLearning,
    setChallengeRound,
    setChallengeOffer,
    setDraftedNote,
    setLowConfidenceMessageId,
    homeworkProblemsState,
    currentProblemIndex,
    activeHomeworkProblem,
    homeworkMode,
    subjectId,
    classifiedSubject,
    isStreaming,
    sessionExpired,
    quotaError,
    draftText,
    notePromptOffered,
    silenceTimerRef,
    lastAiAtRef,
    lastExpectedMinutesRef,
    lastRetryPayloadRef,
    trackerStateRef,
    imageBase64Ref,
    imageMimeTypeRef,
    activeProfileId,
    apiClient,
    startSession,
    streamMessage,
    recordSystemPrompt,
    trackExchange,
    trigger,
    createLocalMessageId,
    responseHistory,
  } = opts;

  // WI-306: Mirror draftText into a ref so the silence-timer callback reads the
  // value at fire time rather than the stale closure value at schedule time.
  const draftTextRef = useRef(draftText);
  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);

  // Serialization tail for concurrent continueWithMessage callers.
  //
  // Earlier shape was `while (activeContinueRef.current) await activeContinueRef.current;`
  // followed by `activeContinueRef.current = currentTurn`. With N ≥ 3
  // concurrent callers, all waiters unblocked on the same microtask when the
  // holder resolved and read `ref.current === null` before any one of them
  // could re-assign it — every caller then ran a parallel stream and the last
  // assignment "won" the ref, stranding earlier turns.
  //
  // The replacement is an atomic chain-tail swap. Each caller reads the
  // current tail and installs its own promise as the new tail in the SAME
  // synchronous block (no `await` between read and write), so JS's
  // run-to-completion semantics guarantee no two callers ever observe the
  // same predecessor. Each caller then awaits its captured predecessor before
  // running its own work, producing a strict FIFO chain.
  const continueChainTailRef = useRef<Promise<void>>(Promise.resolve());

  const syncHomeworkMetadata = useCallback(
    async (
      targetSessionId: string,
      problems: HomeworkProblem[],
      problemIndex: number,
    ) => {
      if (effectiveMode !== 'homework' || problems.length === 0) {
        return;
      }

      const res = await apiClient.sessions[':sessionId'][
        'homework-state'
      ].$post({
        param: { sessionId: targetSessionId },
        json: {
          metadata: buildHomeworkSessionMetadata(
            problems,
            problemIndex,
            normalizedOcrText,
            homeworkCaptureSource,
          ),
        },
      });

      // [L6-001] Route through assertOk so HTTP status maps to the typed
      // error hierarchy (QuotaExceededError, ForbiddenError, etc.) — callers
      // depend on classifyApiError reading the raw error type, not a raw
      // status code embedded in a plain Error's message.
      await assertOk(res);
    },
    [apiClient, effectiveMode, normalizedOcrText, homeworkCaptureSource],
  );

  const ensureSession = useCallback(
    async (
      overrideSubjectId?: string,
      initialRawInput?: string,
    ): Promise<string | null> => {
      if (activeSessionId) return activeSessionId;

      const sid = overrideSubjectId ?? effectiveSubjectId;
      if (!sid) return null;

      const sessionType =
        effectiveMode === 'homework'
          ? ('homework' as const)
          : ('learning' as const);

      // Session-creation errors propagate to the sendMessage catch block,
      // which classifies quota / reconnectable / fatal errors properly.
      // Previously swallowed here, collapsing all failures to a generic message. [IMP-3]
      const sessionRawInput = initialRawInput ?? rawInput;

      let newId: string;
      if (overrideSubjectId) {
        // Use API client directly — useStartSession's URL param may be
        // stale when called in the same render cycle as setClassifiedSubject.
        const res = await apiClient.subjects[':subjectId'].sessions.$post({
          param: { subjectId: overrideSubjectId },
          json: {
            subjectId: overrideSubjectId,
            topicId: topicId ?? undefined,
            sessionType,
            inputMode,
            ...(sessionRawInput ? { rawInput: sessionRawInput } : {}),
            metadata: {
              inputMode,
              effectiveMode,
              ...(resumeFromSessionId ? { resumeFromSessionId } : {}),
              ...(gaps && gaps.length > 0 ? { gaps } : {}),
              ...(effectiveMode === 'homework' &&
              homeworkProblemsState.length > 0
                ? {
                    homework: buildHomeworkSessionMetadata(
                      homeworkProblemsState,
                      currentProblemIndex,
                      normalizedOcrText,
                      homeworkCaptureSource,
                    ),
                  }
                : {}),
            },
          },
        });
        // [L6-001] See above — typed error classification.
        const okRes = await assertOk(res);
        const data = (await okRes.json()) as { session: { id: string } };
        newId = data.session.id;
      } else {
        // [IMP-3] Errors propagate to sendMessage's catch block, which
        // classifies quota / reconnect / fatal failures and surfaces
        // user-visible feedback. The explicit .catch + rethrow is how this
        // intent is declared to the local/require-mutate-error-handling rule.
        const result = await startSession
          .mutateAsync({
            subjectId: sid,
            topicId: topicId ?? undefined,
            sessionType,
            inputMode,
            ...(verificationType
              ? {
                  verificationType: verificationType as
                    | 'evaluate'
                    | 'teach_back',
                }
              : {}),
            ...(sessionRawInput ? { rawInput: sessionRawInput } : {}),
            metadata: {
              inputMode,
              effectiveMode,
              ...(resumeFromSessionId ? { resumeFromSessionId } : {}),
              ...(gaps && gaps.length > 0 ? { gaps } : {}),
              ...(effectiveMode === 'homework' &&
              homeworkProblemsState.length > 0
                ? {
                    homework: buildHomeworkSessionMetadata(
                      homeworkProblemsState,
                      currentProblemIndex,
                      normalizedOcrText,
                      homeworkCaptureSource,
                    ),
                  }
                : {}),
            },
          })
          .catch((err) => {
            throw err;
          });
        newId = result.session.id;
      }
      setActiveSessionId(newId);
      if (effectiveMode === 'homework' && homeworkProblemsState.length > 0) {
        try {
          await syncHomeworkMetadata(
            newId,
            homeworkProblemsState,
            currentProblemIndex,
          );
        } catch (err) {
          reportHomeworkMetadataSyncFailure('ensure_session', err, newId);
          // Keep the session alive even if homework metadata sync fails.
        }
      }
      return newId;
    },
    [
      activeSessionId,
      // BUG-339: Removed activeProfile?.id — it is not read inside
      // ensureSession. Including it caused the callback (and every downstream
      // dependency like continueWithMessage) to be recreated on every profile
      // refetch, risking dropped in-flight state.
      effectiveSubjectId,
      topicId,
      effectiveMode,
      inputMode,
      verificationType,
      rawInput,
      apiClient,
      startSession,
      setActiveSessionId,
      resumeFromSessionId,
      gaps,
      homeworkProblemsState,
      currentProblemIndex,
      normalizedOcrText,
      homeworkCaptureSource,
      syncHomeworkMetadata,
    ],
  );

  const scheduleSilencePrompt = useCallback(
    (sessionIdToUse: string, expectedResponseMinutes: number) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      const thresholdMinutes = Math.min(
        20,
        Math.max(
          2,
          expectedResponseMinutes * computePaceMultiplier(responseHistory),
        ),
      );

      silenceTimerRef.current = setTimeout(
        async () => {
          if (draftTextRef.current.trim()) return;

          const prompt =
            "Still working on it? Take your time - I'm here when you're ready.";

          setMessages((prev) => {
            if (prev.some((message) => message.id === 'silence-prompt')) {
              return prev;
            }
            return [
              ...prev,
              {
                id: 'silence-prompt',
                role: 'assistant',
                content: prompt,
                isSystemPrompt: true,
              },
            ];
          });

          try {
            // WI-373: send the intent token; the server owns the prompt text.
            // The visible `prompt` bubble above is display-only UI copy.
            await recordSystemPrompt.mutateAsync({ kind: 'silence_nudge' });
          } catch (err) {
            console.warn('[Session] Silence prompt failed to persist:', err);
            // Best effort only.
          }

          await writeSessionRecoveryMarker(
            {
              sessionId: sessionIdToUse,
              profileId: activeProfileId ?? undefined,
              subjectId: effectiveSubjectId || undefined,
              subjectName: effectiveSubjectName || undefined,
              topicId: topicId ?? undefined,
              topicName: topicName ?? undefined,
              mode: effectiveMode,
              milestoneTracker: trackerStateRef.current,
              updatedAt: new Date().toISOString(),
            },
            activeProfileId,
          ).catch(() => undefined);
        },
        thresholdMinutes * 60 * 1000,
      );
    },
    [
      activeProfileId,
      effectiveMode,
      effectiveSubjectId,
      effectiveSubjectName,
      recordSystemPrompt,
      responseHistory,
      setMessages,
      silenceTimerRef,
      topicId,
      topicName,
      trackerStateRef,
    ],
  );

  const continueWithMessage = useCallback(
    async (text: string, options?: ContinueMessageOptions) => {
      // ATOMIC chain-tail swap — see `continueChainTailRef` doc above for
      // why this replaced the prior `while (activeContinueRef.current)` poll.
      // Read predecessor and install our own tail in a single sync block; do
      // not put an `await` between these two statements or the race returns.
      let resolveCurrentTurn!: () => void;
      const currentTurn = new Promise<void>((resolve) => {
        resolveCurrentTurn = resolve;
      });
      const predecessor = continueChainTailRef.current;
      continueChainTailRef.current = currentTurn;

      // Wait for the prior turn to fully settle before doing any work.
      // A rejected predecessor must not cancel us — swallow and proceed.
      await predecessor.catch(() => undefined);

      let streamId: string | null = null;
      let resolvedSessionId: string | null = activeSessionId;
      // [H6] SSE freeze watchdog — hoisted so finally can always clear it.
      let sseWatchdogTimerId: ReturnType<typeof setInterval> | null = null;
      let doneCalled = false;
      try {
        const sessionSubjectId = options?.sessionSubjectId;
        const sessionSubjectName = options?.sessionSubjectName;
        const currentHomeworkProblemId =
          effectiveMode === 'homework' ? activeHomeworkProblem?.id : undefined;
        const updatedProblems =
          effectiveMode === 'homework' && currentHomeworkProblemId
            ? withProblemMode(
                homeworkProblemsState,
                currentHomeworkProblemId,
                homeworkMode,
              )
            : homeworkProblemsState;

        if (updatedProblems !== homeworkProblemsState) {
          setHomeworkProblemsState(updatedProblems);
        }

        const apiMessage = buildSessionApiMessage(text, {
          effectiveMode,
          topicName,
          messages,
        });
        const imageAttachment: SessionImageAttachment | undefined =
          options?.imageAttachment ??
          (options?.attachImage &&
          effectiveMode === 'homework' &&
          imageBase64Ref.current &&
          imageMimeTypeRef.current
            ? {
                base64: imageBase64Ref.current,
                mimeType: imageMimeTypeRef.current,
              }
            : undefined);
        const retryOptions: ContinueMessageOptions | undefined =
          options || imageAttachment
            ? {
                ...(options?.sessionSubjectId
                  ? { sessionSubjectId: options.sessionSubjectId }
                  : {}),
                ...(options?.sessionSubjectName
                  ? { sessionSubjectName: options.sessionSubjectName }
                  : {}),
                ...(options?.attachImage ? { attachImage: true } : {}),
                ...(imageAttachment ? { imageAttachment } : {}),
              }
            : undefined;

        // BUG-331: Update retry payload BEFORE ensureSession so that if
        // ensureSession fails and the user reconnects, we replay the correct
        // (current) message — not the payload from the previous send.
        lastRetryPayloadRef.current = {
          text: apiMessage,
          options: retryOptions,
        };

        const sid = await ensureSession(sessionSubjectId, text);
        resolvedSessionId = sid;
        if (!sid) {
          const hasSubject = !!(
            subjectId ||
            classifiedSubject ||
            sessionSubjectId
          );
          const errorMessage = hasSubject
            ? "Couldn't start your session. Check your connection and try again."
            : 'Please select a subject first so I can help you learn.';
          // BUG-144: Render the fallback as a typed system message rather
          // than animating it as a regular AI reply. The 'reconnect_prompt'
          // kind activates the inline retry affordance in the message list,
          // so the user can tap to retry instead of being stranded with
          // plain text. We append a final non-streaming message directly
          // because animateResponse uses an untyped streamId and produces
          // chat-flavored output without any actionable hooks.
          setIsStreaming(false);
          setMessages((prev) => [
            ...prev,
            {
              id: createLocalMessageId('ai'),
              role: 'assistant',
              content: errorMessage,
              isSystemPrompt: true,
              kind: 'reconnect_prompt',
            },
          ]);
          return;
        }

        await writeSessionRecoveryMarker(
          {
            sessionId: sid,
            profileId: activeProfileId ?? undefined,
            subjectId: (sessionSubjectId ?? effectiveSubjectId) || undefined,
            subjectName:
              sessionSubjectName ?? effectiveSubjectName ?? undefined,
            topicId: topicId ?? undefined,
            topicName: topicName ?? undefined,
            mode: effectiveMode,
            // CR-2: Read from ref so this callback doesn't re-create on every
            // milestone tracker tick (stale closure fix).
            milestoneTracker: trackerStateRef.current,
            updatedAt: new Date().toISOString(),
          },
          activeProfileId,
        );

        if (effectiveMode === 'homework' && updatedProblems.length > 0) {
          try {
            await syncHomeworkMetadata(
              sid,
              updatedProblems,
              currentProblemIndex,
            );
          } catch {
            // Don't block the tutoring exchange on metadata sync.
          }
        }

        // Capture into a local const so the closure below sees a definitely
        // non-undefined id without a non-null assertion.
        const newStreamId = createLocalMessageId('ai');
        streamId = newStreamId;
        const previousAiAt = lastAiAtRef.current;
        setMessages((prev) => [
          ...prev,
          { id: newStreamId, role: 'assistant', content: '', streaming: true },
        ]);
        setIsStreaming(true);
        let chunkCount = 0;
        let watchdogConverted = false;

        // [H6] SSE freeze watchdog: if no token arrives for 45s while
        // streaming, classify as a connection drop, surface a retry card.
        const SSE_WATCHDOG_MS = 45_000;
        let lastSseEventAt = Date.now();
        sseWatchdogTimerId = setInterval(() => {
          if (Date.now() - lastSseEventAt >= SSE_WATCHDOG_MS) {
            if (sseWatchdogTimerId !== null) {
              clearInterval(sseWatchdogTimerId);
              sseWatchdogTimerId = null;
            }
            setIsStreaming(false);
            const frozenStreamId = streamId;
            if (frozenStreamId) {
              watchdogConverted = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === frozenStreamId
                    ? {
                        ...m,
                        content: 'Connection dropped — Try again',
                        streaming: false,
                        kind: 'reconnect_prompt' as const,
                      }
                    : m,
                ),
              );
            }
          }
        }, 5_000);

        const outboxEntry =
          activeProfileId && sid
            ? (options?.existingEntry ??
              (await enqueue({
                profileId: activeProfileId,
                flow: 'session',
                surfaceKey: sid,
                content: apiMessage,
                metadata: {
                  sessionId: sid,
                  ...(effectiveMode === 'homework' && homeworkMode
                    ? { homeworkMode }
                    : {}),
                },
              })))
            : null;

        if (outboxEntry && activeProfileId) {
          await beginAttempt(activeProfileId, 'session', outboxEntry.id);
          lastRetryPayloadRef.current = {
            text: apiMessage,
            options: retryOptions,
            outboxEntryId: outboxEntry.id,
          };
        }

        const streamOptions: {
          homeworkMode?: 'help_me' | 'check_answer';
          imageBase64?: string;
          imageMimeType?: ImageMimeType;
          idempotencyKey?: string;
          onReplay?: (result: {
            replayed: true;
            clientId: string;
            status: 'persisted';
            assistantTurnReady: boolean;
            latestExchangeId: string | null;
          }) => void;
        } = {};
        if (effectiveMode === 'homework' && homeworkMode) {
          streamOptions.homeworkMode = homeworkMode;
        }
        if (imageAttachment) {
          streamOptions.imageBase64 = imageAttachment.base64;
          streamOptions.imageMimeType = imageAttachment.mimeType;
          imageBase64Ref.current = null;
          imageMimeTypeRef.current = null;
        }
        if (outboxEntry) {
          streamOptions.idempotencyKey = outboxEntry.id;
          streamOptions.onReplay = (replay) => {
            void (async () => {
              if (activeProfileId) {
                await markConfirmed(activeProfileId, 'session', outboxEntry.id);
              }
            })();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      content: replay.assistantTurnReady
                        ? 'Previous send restored.'
                        : 'Previous send restored. Waiting for the reply…',
                      streaming: false,
                      isSystemPrompt: true,
                    }
                  : m,
              ),
            );
            setIsStreaming(false);
          };
        }

        await streamMessage(
          apiMessage,
          (accumulated) => {
            // [H6] Reset watchdog timestamp on each token.
            lastSseEventAt = Date.now();
            chunkCount += 1;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId ? { ...m, content: accumulated } : m,
              ),
            );
          },
          async (result) => {
            doneCalled = true;
            const shouldConvertToReconnect =
              watchdogConverted || !!result.fallback || chunkCount === 0;
            const trackedExchange = shouldConvertToReconnect
              ? null
              : trackExchange({
                  userMessage: apiMessage,
                  escalationRung: result.escalationRung,
                });
            const nextTrackerState =
              trackedExchange?.trackerState ?? trackerStateRef.current;

            if (trackedExchange) {
              trackedExchange.triggered.forEach((reason) => {
                trigger({
                  celebration: celebrationForReason(reason),
                  reason,
                  detail: null,
                });
              });
            }

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== streamId) return m;
                if (m.kind === 'reconnect_prompt') return m;
                if (shouldConvertToReconnect) {
                  return {
                    ...m,
                    content:
                      result.fallback?.fallbackText ??
                      "I didn't have a reply — tap to try again.",
                    streaming: false,
                    kind: 'reconnect_prompt' as const,
                    eventId: result.aiEventId,
                  };
                }
                return {
                  ...m,
                  streaming: false,
                  eventId: result.aiEventId,
                  escalationRung: result.escalationRung,
                };
              }),
            );
            setExchangeCount(result.exchangeCount);
            setEscalationRung(result.escalationRung);

            if (shouldConvertToReconnect) {
              if (activeProfileId && outboxEntry) {
                await recordFailure(
                  activeProfileId,
                  'session',
                  outboxEntry.id,
                  result.fallback?.reason ?? 'missing_reply',
                );
              }
              setLowConfidenceMessageId(null);
              return;
            }

            if (activeProfileId && outboxEntry) {
              await markConfirmed(activeProfileId, 'session', outboxEntry.id);
            }

            // Handle note prompt triggers
            if (result.notePrompt && !notePromptOffered) {
              setNotePromptOffered(true);
            }
            if (result.notePromptPostSession) {
              setShowNoteInput(true);
            }

            // Handle fluency drill state
            if (result.fluencyDrill) {
              setFluencyDrill(result.fluencyDrill);
            }
            setLanguageLearning(
              result.languageLearning?.gradedInput
                ? result.languageLearning
                : null,
            );

            if (result.challengeRound) {
              setChallengeRound(result.challengeRound);
            }
            if (result.challengeOffer) {
              setChallengeOffer(result.challengeOffer);
            }
            if (result.draftedNote) {
              setDraftedNote(result.draftedNote);
            }

            // F6: Surface low-confidence indicator below the AI message
            // 'medium' and 'high' (and absent, treated as 'medium') show nothing.
            if (result.confidence === 'low') {
              setLowConfidenceMessageId(streamId);
            } else {
              // Clear any previous low-confidence indicator from a prior exchange.
              setLowConfidenceMessageId(null);
            }

            if (previousAiAt) {
              setResponseHistory((prev) => [
                ...prev,
                {
                  actualSeconds: Math.round((Date.now() - previousAiAt) / 1000),
                  expectedMinutes: lastExpectedMinutesRef.current,
                },
              ]);
            }
            const expectedResponseMinutes =
              result.expectedResponseMinutes ?? 10;
            lastExpectedMinutesRef.current = expectedResponseMinutes;
            lastAiAtRef.current = Date.now();
            scheduleSilencePrompt(sid, expectedResponseMinutes);
            await writeSessionRecoveryMarker(
              {
                sessionId: sid,
                profileId: activeProfileId ?? undefined,
                subjectId:
                  (sessionSubjectId ?? effectiveSubjectId) || undefined,
                subjectName:
                  sessionSubjectName ?? effectiveSubjectName ?? undefined,
                topicId: topicId ?? undefined,
                mode: effectiveMode,
                milestoneTracker: nextTrackerState,
                updatedAt: new Date().toISOString(),
              },
              activeProfileId,
            );
          },
          sid,
          Object.keys(streamOptions).length > 0 ? streamOptions : undefined,
        );
      } catch (err: unknown) {
        if (activeProfileId && lastRetryPayloadRef.current?.outboxEntryId) {
          await recordFailure(
            activeProfileId,
            'session',
            lastRetryPayloadRef.current.outboxEntryId,
            err instanceof Error ? err.message : 'stream_failed',
          );
        }
        // Detect quota before reconnect classification — QuotaExceededError is
        // never reconnectable and needs a structured card, not a text bubble.
        // [BUG-947] Name guard instead of instanceof for Metro HMR resilience.
        if (
          err instanceof Error &&
          err.name === 'QuotaExceededError' &&
          'details' in err
        ) {
          setIsStreaming(false);
          setQuotaError(
            (err as Error & { details: QuotaExceededDetails }).details,
          );
          if (streamId) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamId
                  ? {
                      ...message,
                      content: '',
                      streaming: false,
                      kind: 'quota_exceeded' as const,
                      isSystemPrompt: true,
                    }
                  : message,
              ),
            );
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: createLocalMessageId('ai'),
                role: 'assistant',
                content: '',
                isSystemPrompt: true,
                kind: 'quota_exceeded' as const,
              },
            ]);
          }
          return;
        }

        const reconnectable = isReconnectableSessionError(err);
        const streamErrorCode = getStreamErrorCode(err);
        if (shouldCaptureLlmStreamError(err)) {
          Sentry.captureException(err, {
            tags: {
              surface: 'session_stream',
              feature: 'llm',
              mode: effectiveMode,
              reconnectable: String(reconnectable),
              code: streamErrorCode ?? 'unknown',
            },
            extra: {
              sessionId: resolvedSessionId,
              profileId: activeProfileId,
              subjectId: options?.sessionSubjectId ?? effectiveSubjectId,
              topicId,
              inputMode,
            },
          });
        }
        const formattedError = formatApiError(err);
        // [3B.1] Classify: timeout → timeout msg, 5xx → server error, network → reconnect,
        // CORS/config → config error, fatal 4xx → formatted api error (non-reconnectable).
        const errorMessage = reconnectable
          ? reconnectPromptForError(err)
          : formattedError;

        setIsStreaming(false);
        if (streamId) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === streamId
                ? {
                    ...message,
                    content: errorMessage,
                    streaming: false,
                    kind: reconnectable ? 'reconnect_prompt' : undefined,
                    isSystemPrompt: reconnectable,
                  }
                : message,
            ),
          );
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: createLocalMessageId('ai'),
            role: 'assistant',
            content: errorMessage,
            isSystemPrompt: reconnectable,
            kind: reconnectable ? 'reconnect_prompt' : undefined,
          },
        ]);
      } finally {
        // [H6] Always clear the SSE watchdog when the stream settles.
        if (sseWatchdogTimerId !== null) {
          clearInterval(sseWatchdogTimerId);
          sseWatchdogTimerId = null;
        }
        setIsStreaming(false);
        if (streamId) {
          setMessages((prev) => {
            const msg = prev.find((m) => m.id === streamId);
            if (!msg) return prev;
            if (!doneCalled && msg.streaming && !msg.kind) {
              return prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      content: 'Connection lost — Try again',
                      streaming: false,
                      kind: 'reconnect_prompt' as const,
                    }
                  : m,
              );
            }
            if (msg.streaming) {
              return prev.map((m) =>
                m.id === streamId ? { ...m, streaming: false } : m,
              );
            }
            return prev;
          });
        }
        // If we are still the chain tail (no later caller appended), clear
        // it back to a fresh resolved promise so the ref doesn't hold onto
        // this turn's closure indefinitely. If a later caller already
        // appended themselves, leave the tail alone — they reference this
        // turn as their predecessor and will resolve their own tail.
        if (continueChainTailRef.current === currentTurn) {
          continueChainTailRef.current = Promise.resolve();
        }
        resolveCurrentTurn();
      }
    },
    [
      activeHomeworkProblem,
      activeSessionId,
      activeProfileId,
      classifiedSubject,
      createLocalMessageId,
      currentProblemIndex,
      effectiveMode,
      effectiveSubjectId,
      effectiveSubjectName,
      ensureSession,
      homeworkMode,
      homeworkProblemsState,
      imageBase64Ref,
      imageMimeTypeRef,
      inputMode,
      lastAiAtRef,
      lastExpectedMinutesRef,
      lastRetryPayloadRef,
      messages,
      notePromptOffered,
      scheduleSilencePrompt,
      setExchangeCount,
      setEscalationRung,
      setChallengeOffer,
      setChallengeRound,
      setDraftedNote,
      setFluencyDrill,
      setLanguageLearning,
      setHomeworkProblemsState,
      setIsStreaming,
      setLowConfidenceMessageId,
      setMessages,
      setNotePromptOffered,
      setQuotaError,
      setResponseHistory,
      setShowNoteInput,
      streamMessage,
      subjectId,
      syncHomeworkMetadata,
      topicId,
      topicName,
      trackerStateRef,
      trackExchange,
      // CR-2: trackerState removed — reads trackerStateRef.current inside body.
      // CR-3: Removed duplicate createLocalMessageId entry.
      trigger,
    ],
  );

  const handleReconnect = useCallback(
    async (messageId: string) => {
      // CR-5: Also guard on quotaError — reconnecting into a quota wall just
      // replays the send that will fail again immediately.
      if (
        !lastRetryPayloadRef.current ||
        isStreaming ||
        sessionExpired ||
        quotaError
      ) {
        return;
      }

      const retryPayload = lastRetryPayloadRef.current;
      const existingEntry =
        retryPayload.outboxEntryId && activeProfileId
          ? await getOutboxEntry(
              activeProfileId,
              'session',
              retryPayload.outboxEntryId,
            )
          : null;
      // Remove both the error message AND the user's preceding message to
      // prevent the AI from seeing a duplicate exchange (the replay via
      // continueWithMessage re-adds the user message to the transcript).
      setMessages((prev) => {
        const errorIndex = prev.findIndex((m) => m.id === messageId);
        if (errorIndex < 0) return prev;
        // The user message that triggered the failed stream is immediately
        // before the error AI message.
        const userIndex =
          errorIndex > 0 && prev[errorIndex - 1]?.role === 'user'
            ? errorIndex - 1
            : -1;
        return prev.filter((_, i) => i !== errorIndex && i !== userIndex);
      });
      await continueWithMessage(retryPayload.text, {
        ...retryPayload.options,
        ...(existingEntry ? { existingEntry } : {}),
      });
    },
    [
      activeProfileId,
      continueWithMessage,
      isStreaming,
      lastRetryPayloadRef,
      quotaError,
      sessionExpired,
      setMessages,
    ],
  );

  const fetchFastCelebrations = useCallback(async (): Promise<
    PendingCelebration[]
  > => {
    try {
      const startedAt = Date.now();

      while (Date.now() - startedAt < 3000) {
        if (!mountedRef.current) return [];
        const res = await apiClient.celebrations.pending.$get({
          query: { viewer: 'child' },
        });
        if (!mountedRef.current) return [];
        if (res.ok) {
          const data = await res.json();
          if (!mountedRef.current) return [];
          if (data.pendingCelebrations.length > 0) {
            if (!mountedRef.current) return [];
            await apiClient.celebrations.seen.$post({
              json: { viewer: 'child' },
            });
            if (!mountedRef.current) return [];
            return data.pendingCelebrations;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!mountedRef.current) return [];
      }

      return [];
    } catch (error) {
      // BUG-147: Silent recovery without escalation is banned (AGENTS.md
      // "Code Quality Guards"). Promote to structured Sentry capture so
      // celebration-fetch failures are queryable in telemetry instead of
      // disappearing into device-local console logs only.
      console.error('[Session] Failed to fetch celebrations:', error);
      Sentry.captureException(error, {
        tags: { surface: 'fetch_celebrations' },
      });
      return [];
    }
  }, [apiClient]);

  return {
    syncHomeworkMetadata,
    ensureSession,
    scheduleSilencePrompt,
    continueWithMessage,
    handleReconnect,
    fetchFastCelebrations,
  };
}
