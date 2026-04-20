import { useCallback } from 'react';
import type {
  InputMode,
  PendingCelebration,
  HomeworkCaptureSource,
  HomeworkProblem,
} from '@eduagent/schemas';
import type { FluencyDrillEvent } from '../../lib/sse';
import type { ChatMessage } from '../session';
import { animateResponse } from '../session';
import type {
  useStreamMessage,
  useStartSession,
  useRecordSystemPrompt,
} from '../../hooks/use-sessions';
import {
  useApiClient,
  QuotaExceededError,
  type QuotaExceededDetails,
} from '../../lib/api-client';
import { formatApiError } from '../../lib/format-api-error';
import { writeSessionRecoveryMarker } from '../../lib/session-recovery';
import {
  buildHomeworkSessionMetadata,
  withProblemMode,
} from '../homework/problem-cards';
import {
  celebrationForReason,
  type useMilestoneTracker,
} from '../../hooks/use-milestone-tracker';
import type { useCelebration } from '../../hooks/use-celebration';
import {
  computePaceMultiplier,
  isReconnectableSessionError,
  isTimeoutError,
  RECONNECT_PROMPT,
  TIMEOUT_PROMPT,
} from './session-types';

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
    options?: { sessionSubjectId?: string; sessionSubjectName?: string };
  } | null>;
  trackerStateRef: React.MutableRefObject<
    ReturnType<typeof useMilestoneTracker>['trackerState']
  >;
  /** Base64-encoded homework image to send with the first message (set once, cleared after send) */
  imageBase64Ref: React.MutableRefObject<string | null>;
  imageMimeTypeRef: React.MutableRefObject<
    'image/jpeg' | 'image/png' | 'image/webp' | null
  >;

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
  const {
    activeSessionId,
    setActiveSessionId,
    effectiveSubjectId,
    effectiveSubjectName,
    effectiveMode,
    topicId,
    topicName,
    inputMode,
    rawInput,
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
    animationCleanupRef,
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

  const syncHomeworkMetadata = useCallback(
    async (
      targetSessionId: string,
      problems: HomeworkProblem[],
      problemIndex: number
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
            homeworkCaptureSource
          ),
        },
      });

      if (!res.ok) {
        throw new Error(`Homework state sync failed: ${res.status}`);
      }
    },
    [apiClient, effectiveMode, normalizedOcrText, homeworkCaptureSource]
  );

  const ensureSession = useCallback(
    async (overrideSubjectId?: string): Promise<string | null> => {
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
            ...(rawInput ? { rawInput } : {}),
            metadata: {
              inputMode,
              effectiveMode,
              ...(effectiveMode === 'homework' &&
              homeworkProblemsState.length > 0
                ? {
                    homework: buildHomeworkSessionMetadata(
                      homeworkProblemsState,
                      currentProblemIndex,
                      normalizedOcrText,
                      homeworkCaptureSource
                    ),
                  }
                : {}),
            },
          },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`API error ${res.status}: ${body || res.statusText}`);
        }
        const data = (await res.json()) as { session: { id: string } };
        newId = data.session.id;
      } else {
        const result = await startSession.mutateAsync({
          subjectId: sid,
          topicId: topicId ?? undefined,
          sessionType,
          inputMode,
          ...(verificationType
            ? {
                verificationType: verificationType as 'evaluate' | 'teach_back',
              }
            : {}),
          ...(rawInput ? { rawInput } : {}),
          metadata: {
            inputMode,
            effectiveMode,
            ...(effectiveMode === 'homework' && homeworkProblemsState.length > 0
              ? {
                  homework: buildHomeworkSessionMetadata(
                    homeworkProblemsState,
                    currentProblemIndex,
                    normalizedOcrText,
                    homeworkCaptureSource
                  ),
                }
              : {}),
          },
        });
        newId = result.session.id;
      }
      setActiveSessionId(newId);
      if (effectiveMode === 'homework' && homeworkProblemsState.length > 0) {
        try {
          await syncHomeworkMetadata(
            newId,
            homeworkProblemsState,
            currentProblemIndex
          );
        } catch (err) {
          console.warn(
            '[Session] Homework metadata sync failed during ensureSession:',
            err
          );
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
      apiClient,
      startSession,
      homeworkProblemsState,
      currentProblemIndex,
      normalizedOcrText,
      homeworkCaptureSource,
      syncHomeworkMetadata,
    ]
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
          expectedResponseMinutes * computePaceMultiplier(responseHistory)
        )
      );

      silenceTimerRef.current = setTimeout(async () => {
        if (draftText.trim()) return;

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
          await recordSystemPrompt.mutateAsync({ content: prompt });
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
          activeProfileId
        ).catch(() => undefined);
      }, thresholdMinutes * 60 * 1000);
    },
    [
      activeProfileId,
      draftText,
      effectiveMode,
      effectiveSubjectId,
      effectiveSubjectName,
      recordSystemPrompt,
      responseHistory,
      setMessages,
      silenceTimerRef,
      topicId,
      trackerStateRef,
    ]
  );

  const continueWithMessage = useCallback(
    async (
      text: string,
      options?: {
        sessionSubjectId?: string;
        sessionSubjectName?: string;
      }
    ) => {
      let streamId: string | null = null;
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
                homeworkMode
              )
            : homeworkProblemsState;

        if (updatedProblems !== homeworkProblemsState) {
          setHomeworkProblemsState(updatedProblems);
        }

        // BUG-331: Update retry payload BEFORE ensureSession so that if
        // ensureSession fails and the user reconnects, we replay the correct
        // (current) message — not the payload from the previous send.
        lastRetryPayloadRef.current = {
          text,
          options,
        };

        const sid = await ensureSession(sessionSubjectId);
        if (!sid) {
          const hasSubject = !!(
            subjectId ||
            classifiedSubject ||
            sessionSubjectId
          );
          const errorMessage = hasSubject
            ? "Couldn't start your session. Check your connection and try again."
            : 'Please select a subject first so I can help you learn.';
          animationCleanupRef.current = animateResponse(
            errorMessage,
            setMessages,
            setIsStreaming
          );
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
          activeProfileId
        );

        if (effectiveMode === 'homework' && updatedProblems.length > 0) {
          try {
            await syncHomeworkMetadata(
              sid,
              updatedProblems,
              currentProblemIndex
            );
          } catch {
            // Don't block the tutoring exchange on metadata sync.
          }
        }

        streamId = createLocalMessageId('ai');
        const previousAiAt = lastAiAtRef.current;
        setMessages((prev) => [
          ...prev,
          { id: streamId!, role: 'assistant', content: '', streaming: true },
        ]);
        setIsStreaming(true);

        const streamOptions: {
          homeworkMode?: 'help_me' | 'check_answer';
          imageBase64?: string;
          imageMimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
        } = {};
        if (effectiveMode === 'homework' && homeworkMode) {
          streamOptions.homeworkMode = homeworkMode;
        }
        if (imageBase64Ref.current && imageMimeTypeRef.current) {
          streamOptions.imageBase64 = imageBase64Ref.current;
          streamOptions.imageMimeType = imageMimeTypeRef.current;
          // Clear after first send — subsequent messages are text-only
          imageBase64Ref.current = null;
          imageMimeTypeRef.current = null;
        }

        await streamMessage(
          text,
          (accumulated) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId ? { ...m, content: accumulated } : m
              )
            );
          },
          async (result) => {
            const { triggered, trackerState: nextTrackerState } = trackExchange(
              {
                userMessage: text,
                escalationRung: result.escalationRung,
              }
            );
            triggered.forEach((reason) => {
              trigger({
                celebration: celebrationForReason(reason),
                reason,
                detail: null,
              });
            });

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== streamId) return m;
                // Strip JSON annotations from visible message text
                let content = m.content;
                if (result.notePrompt) {
                  content = content
                    .replace(
                      /\n?\{"notePrompt":\s*true(?:,\s*"postSession":\s*true)?\}\s*$/,
                      ''
                    )
                    .trimEnd();
                }
                if (result.fluencyDrill) {
                  content = content
                    .replace(/\n?\{"fluencyDrill":\s*\{[^}]*\}\s*\}\s*$/, '')
                    .trimEnd();
                }
                return {
                  ...m,
                  content,
                  streaming: false,
                  eventId: result.aiEventId,
                  escalationRung: result.escalationRung,
                };
              })
            );
            setIsStreaming(false);
            setExchangeCount(result.exchangeCount);
            setEscalationRung(result.escalationRung);

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
              activeProfileId
            );
          },
          sid,
          Object.keys(streamOptions).length > 0 ? streamOptions : undefined
        );
      } catch (err: unknown) {
        // Detect quota before reconnect classification — QuotaExceededError is
        // never reconnectable and needs a structured card, not a text bubble.
        if (err instanceof QuotaExceededError) {
          setIsStreaming(false);
          setQuotaError(err.details);
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
                  : message
              )
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
        const formattedError = formatApiError(err);
        // [3B.1] Classify: timeout -> specific message, network -> reconnect, fatal -> server msg
        const errorMessage = reconnectable
          ? isTimeoutError(err)
            ? TIMEOUT_PROMPT
            : RECONNECT_PROMPT
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
                : message
            )
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
      }
    },
    [
      activeHomeworkProblem,
      activeProfileId,
      animationCleanupRef,
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
      lastAiAtRef,
      lastExpectedMinutesRef,
      lastRetryPayloadRef,
      notePromptOffered,
      scheduleSilencePrompt,
      setExchangeCount,
      setEscalationRung,
      setFluencyDrill,
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
      trackerStateRef,
      trackExchange,
      // CR-2: trackerState removed — reads trackerStateRef.current inside body.
      // CR-3: Removed duplicate createLocalMessageId entry.
      trigger,
    ]
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
      await continueWithMessage(retryPayload.text, retryPayload.options);
    },
    [
      continueWithMessage,
      isStreaming,
      lastRetryPayloadRef,
      quotaError,
      sessionExpired,
      setMessages,
    ]
  );

  const fetchFastCelebrations = useCallback(async (): Promise<
    PendingCelebration[]
  > => {
    try {
      const startedAt = Date.now();

      while (Date.now() - startedAt < 3000) {
        const res = await apiClient.celebrations.pending.$get();
        if (res.ok) {
          const data = await res.json();
          if (data.pendingCelebrations.length > 0) {
            await apiClient.celebrations.seen.$post({
              json: { viewer: 'child' },
            });
            return data.pendingCelebrations;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return [];
    } catch (error) {
      console.error('[Session] Failed to fetch celebrations:', error);
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
