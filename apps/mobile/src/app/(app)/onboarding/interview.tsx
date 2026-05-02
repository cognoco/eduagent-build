import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  ChatShell,
  LivingBook,
  type ChatMessage,
} from '../../../components/session';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import {
  useInterviewState,
  useStreamInterviewMessage,
  useForceCompleteInterview,
} from '../../../hooks/use-interview';
import { useStartSession, useStreamMessage } from '../../../hooks/use-sessions';
import { formatApiError } from '../../../lib/format-api-error';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { Sentry } from '../../../lib/sentry';
import { useProfile } from '../../../lib/profile';
import { OutboxFailedBanner } from '../../../components/durability/OutboxFailedBanner';
import { InterviewCompletingPanel } from '../../../components/interview/InterviewCompletingPanel';
import { InterviewFailedPanel } from '../../../components/interview/InterviewFailedPanel';
import {
  beginAttempt,
  enqueue,
  markConfirmed,
  recordFailure,
  type OutboxEntry,
} from '../../../lib/message-outbox';

const OPENING_MESSAGE =
  "Hi! I'm your learning mate. Before we build your learning path — what do you already know about this subject? Even a rough sense is helpful.";

export default function InterviewScreen() {
  const {
    subjectId,
    subjectName,
    bookId,
    bookTitle,
    languageCode,
    languageName,
    step: stepParam,
    totalSteps: totalStepsParam,
  } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    bookId?: string;
    bookTitle?: string;
    languageCode?: string;
    languageName?: string;
    step?: string;
    totalSteps?: string;
  }>();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const step = Number(stepParam) || 1;
  const totalSteps = Number(totalStepsParam) || 4;

  // BUG-316: Guard against empty/missing subjectId — hooks receive empty string
  // which triggers a 404 API call. Show error state instead.
  // [BUG-810] Explicitly disable the query when safeSubjectId is undefined so
  // the gate is visible at the call site (defence-in-depth — the hook also
  // enforces `!!subjectId` internally).
  const safeSubjectId = subjectId && subjectId.trim() ? subjectId : undefined;
  const interviewState = useInterviewState(safeSubjectId ?? '', {
    enabled: !!safeSubjectId,
  });
  const {
    stream: streamInterview,
    abort: abortStream,
    isStreaming: isStreamingSSE,
  } = useStreamInterviewMessage(safeSubjectId ?? '', bookId);
  const forceComplete = useForceCompleteInterview(safeSubjectId ?? '', bookId);

  // ---------------------------------------------------------------------------
  // Session-phase hooks: after the interview completes, the screen silently
  // transitions into a learning session so the conversation never stops.
  // Hooks are called unconditionally (rules of hooks).
  // ---------------------------------------------------------------------------
  const startSession = useStartSession(safeSubjectId ?? '');
  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;
  const [sessionPhase, setSessionPhase] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sessionCreatingRef = useRef(false);
  // True when sessionPhase is set but activeSessionId has not arrived within 20s
  const [sessionCreationStuck, setSessionCreationStuck] = useState(false);
  const { stream: streamSessionMessage, isStreaming: isSessionStreaming } =
    useStreamMessage(activeSessionId ?? '');

  const openingMessage = useMemo(
    () =>
      bookTitle
        ? `Hi! I'm your learning mate. Before we start — what can you tell me about ${bookTitle}? Your best understanding, even a rough guess, is a great start.`
        : subjectName
        ? `Hi! I'm your learning mate. Before we build your learning path — what do you already know about ${subjectName}? Even a rough sense is helpful.`
        : OPENING_MESSAGE,
    [bookTitle, subjectName]
  );

  // BKT-C.2: Captured interest labels extracted from the interview transcript.
  // Populated by either handleSkipInterview (force-complete mutation response)
  // or the state-seeding effect below when the draft arrives already-completed.
  // goToNextStep reads this + falls back to the state query as a safety net.
  const [extractedInterests, setExtractedInterests] = useState<string[] | null>(
    null
  );

  const goToNextStep = useCallback(() => {
    if (!subjectId) return;

    const baseParams = {
      subjectId,
      subjectName: subjectName ?? '',
      step: String(Math.min(step + 1, totalSteps)),
      totalSteps: String(totalSteps),
    };

    // BKT-C.2: If the interview yielded interest labels, route through the
    // interests-context picker before the language/analogy fork. The picker
    // owns the downstream routing to language-setup or analogy-preference,
    // so we only need to forward the fork inputs + extracted labels.
    // [BUG-804] Read server-side state first; local extractedInterests is a
    // safety net for the force-complete path (which seeds it from the
    // mutation response) but server data is canonical. The previous order
    // (`extractedInterests ?? query.data ?? []`) would silently mask a stale
    // local-state value if a future caller forgot to clear it on subjectId
    // change.
    const interests =
      interviewState.data?.extractedSignals?.interests ??
      extractedInterests ??
      [];
    if (interests.length > 0) {
      router.replace({
        pathname: '/(app)/onboarding/interests-context',
        params: {
          ...baseParams,
          // Comma-separated list is the contract expected by interests-context.
          // Commas inside a label are unlikely (prompt constrains to 1-3 words)
          // but would be lossy — guard by stripping commas from each label.
          interests: interests.map((l) => l.replace(/,/g, '')).join(','),
          ...(languageCode
            ? { languageCode, languageName: languageName ?? '' }
            : {}),
        },
      } as never);
      return;
    }

    if (languageCode) {
      router.replace({
        pathname: '/(app)/onboarding/language-setup',
        params: {
          ...baseParams,
          languageCode,
          languageName: languageName ?? '',
        },
      } as never);
      return;
    }

    router.replace({
      pathname: '/(app)/onboarding/analogy-preference',
      params: baseParams,
    } as never);
  }, [
    extractedInterests,
    interviewState.data?.extractedSignals?.interests,
    languageCode,
    languageName,
    router,
    step,
    subjectId,
    subjectName,
    totalSteps,
  ]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'assistant', content: openingMessage },
  ]);
  const isStreaming = isStreamingSSE || isSessionStreaming;
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const seededDraftRef = useRef(false);
  // BUG-317: Store last sent text so Try Again can resend the orphaned message
  const lastSentTextRef = useRef<string | null>(null);
  const lastOutboxEntryRef = useRef<OutboxEntry | null>(null);
  // BUG-692-FOLLOWUP: Guard post-await navigation in handleSkipInterview against
  // the user having navigated away (hardware back) while the mutation was in
  // flight. Set to true when the screen loses focus, reset before each attempt.
  const skipCancelledRef = useRef(false);

  // [BUG-UX-INTERVIEW-SKIP-TIMEOUT] Hard 30s timeout on the "I'm ready to
  // start learning" skip action. forceComplete.mutateAsync calls the LLM to
  // close the interview — if it hangs the button label freezes on
  // "Setting up your curriculum…" with no escape. On timeout we show an inline
  // error with a Go Back action so the user is never silently stuck.
  const [forceCompleteTimedOut, setForceCompleteTimedOut] = useState(false);
  useEffect(() => {
    if (!forceComplete.isPending) {
      setForceCompleteTimedOut(false);
      return undefined;
    }
    const FORCE_COMPLETE_TIMEOUT_MS = 30_000;
    const timer = setTimeout(
      () => setForceCompleteTimedOut(true),
      FORCE_COMPLETE_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [forceComplete.isPending]);

  useFocusEffect(
    useCallback(() => {
      skipCancelledRef.current = false;
      return () => {
        skipCancelledRef.current = true;
      };
    }, [])
  );

  // R-4: Exclude isAutoSent messages — consistent with session screen (BUG-373).
  // Currently no auto-sends in interview, but this prevents latent bugs.
  const exchangeCount = useMemo(
    () => messages.filter((m) => m.role === 'user' && !m.isAutoSent).length,
    [messages]
  );

  // ---------------------------------------------------------------------------
  // Session transition: silently start a learning session after interview ends.
  // The curriculum is already persisted server-side when isComplete fires.
  // ---------------------------------------------------------------------------
  const transitionToSession = useCallback(async () => {
    if (sessionCreatingRef.current || !safeSubjectId) return;
    sessionCreatingRef.current = true;
    try {
      const result = await startSessionRef.current.mutateAsync({
        subjectId: safeSubjectId,
        sessionType: 'learning',
        inputMode: 'text',
      });
      setActiveSessionId(result.session.id);
      setSessionPhase(true);
    } catch (err) {
      // [BUG-803] Surface the failure via the existing
      // session-creation-stuck retry UX (Try Again + Go Back) instead of
      // silently swapping to the "Let's Go" card — which made it look like
      // the interview succeeded when in reality the session never started
      // and there was no retry path. Sentry capture replaces the prior
      // console.error-only logging so failures are observable in production.
      Sentry.captureException(err, {
        tags: {
          component: 'InterviewScreen',
          action: 'transition-to-session',
        },
      });
      console.error(
        '[Interview→Session] Session creation FAILED, surfacing retry:',
        err
      );
      setSessionPhase(true);
      setSessionCreationStuck(true);
      sessionCreatingRef.current = false;
    }
  }, [safeSubjectId]);

  // [BUG-816 / F-MOB-18] If router pushes the screen with a different
  // subjectId while it's still mounted, every piece of interview-screen-local
  // state must reset — otherwise messages from the previous interview, the
  // session-phase flag, or extracted interests would leak across subjects and
  // corrupt onboarding. Watching `subjectId` (and `openingMessage`, which is
  // tied to subjectName/bookTitle) makes the reset explicit and exhaustive
  // rather than relying on remount. Refs are reset alongside state to keep
  // the in-flight session-creation guard in sync.
  useEffect(() => {
    seededDraftRef.current = false;
    setMessages([
      { id: 'opening', role: 'assistant', content: openingMessage },
    ]);
    setInterviewComplete(false);
    setSessionPhase(false);
    setActiveSessionId(null);
    sessionCreatingRef.current = false;
    setRestartRequired(false);
    setStreamError(null);
    setExtractedInterests(null);
    setSessionCreationStuck(false);
  }, [subjectId, openingMessage]);

  // 20s timeout: if sessionPhase is set but activeSessionId hasn't arrived,
  // surface a tap-to-retry inline error so the user isn't silently stuck.
  useEffect(() => {
    if (!sessionPhase || activeSessionId) {
      setSessionCreationStuck(false);
      return;
    }
    const timer = setTimeout(() => {
      setSessionCreationStuck(true);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [sessionPhase, activeSessionId]);

  useEffect(() => {
    return () => {
      abortStream();
    };
  }, [abortStream]);

  useEffect(() => {
    if (seededDraftRef.current || interviewState.isLoading) {
      return;
    }

    const state = interviewState.data;
    if (!state) {
      seededDraftRef.current = true;
      return;
    }

    const mappedHistory =
      state.exchangeHistory?.map(
        (exchange, index): ChatMessage => ({
          id: `draft-${index}`,
          role: exchange.role === 'assistant' ? 'assistant' : 'user',
          content: exchange.content.trimEnd(),
        })
      ) ?? [];

    if (state.status === 'completed') {
      setMessages(
        mappedHistory.length > 0
          ? mappedHistory
          : [{ id: 'opening', role: 'assistant', content: openingMessage }]
      );
      setInterviewComplete(true);
      // BKT-C.2: If the completed draft already has extracted interests, lift
      // them into local state so goToNextStep can read them synchronously.
      // Functional setter keeps a once-only semantic without introducing a
      // `extractedInterests` dep that would re-run this effect mid-seeding.
      if (
        state.extractedSignals?.interests &&
        state.extractedSignals.interests.length > 0
      ) {
        const seeded = state.extractedSignals.interests;
        setExtractedInterests((prev) => prev ?? seeded);
      }
      seededDraftRef.current = true;
      return;
    }

    if (state.status === 'expired') {
      setMessages([
        {
          id: 'expired',
          role: 'assistant',
          content: state.resumeSummary?.trim()
            ? `This interview expired after 7 days away. ${state.resumeSummary}`
            : 'This interview expired after 7 days away. Restart to begin again.',
        },
      ]);
      setRestartRequired(true);
      seededDraftRef.current = true;
      return;
    }

    if (mappedHistory.length > 0) {
      const resumePrompt =
        state.resumeSummary?.trim() ??
        'Continue your interview? We can pick up where you left off.';
      setMessages([
        ...mappedHistory,
        {
          id: 'resume',
          role: 'assistant',
          content: `Continue your interview? ${resumePrompt}`,
          // Mark as system prompt WITHOUT a kind so ChatShell's filter
          // hides it from the message list. The seeded exchange history
          // already shows the user's past messages — the resume summary
          // was rendering as a confusing extra AI chat bubble.
          isSystemPrompt: true,
        },
      ]);
    }

    seededDraftRef.current = true;
  }, [interviewState.data, interviewState.isLoading, openingMessage]);

  const handleRestartInterview = useCallback(() => {
    try {
      abortStream();
      setMessages([
        { id: 'opening', role: 'assistant', content: openingMessage },
      ]);
      setInterviewComplete(false);
      setSessionPhase(false);
      setActiveSessionId(null);
      sessionCreatingRef.current = false;
      setRestartRequired(false);
      setStreamError(null);
      seededDraftRef.current = true;
    } catch (err: unknown) {
      platformAlert('Could not restart interview', formatApiError(err));
    }
  }, [abortStream, openingMessage]);

  // [BUG-464] Client escape: let user skip ahead after 2+ exchanges
  const handleSkipInterview = useCallback(async () => {
    if (interviewComplete || sessionPhase || forceComplete.isPending) return;
    // BUG-692-FOLLOWUP: Reset the cancellation flag at the start of each attempt
    // so a prior back-navigation doesn't permanently suppress the next attempt.
    skipCancelledRef.current = false;
    try {
      abortStream();
      const result = await forceComplete.mutateAsync();
      // BUG-692-FOLLOWUP: User navigated away while the mutation was in flight —
      // don't advance the wizard from a screen the user has already left.
      if (skipCancelledRef.current) return;
      // BKT-C.2: Capture freshly-extracted interests from the mutation
      // response so goToNextStep can route into the interests-context picker
      // without waiting for the invalidated state query to refetch.
      if (
        result.extractedSignals?.interests &&
        result.extractedSignals.interests.length > 0
      ) {
        setExtractedInterests(result.extractedSignals.interests);
      }
      // Advance the onboarding wizard immediately. The previous approach
      // (transitionToSession) silently entered a session phase with no
      // visible "continue" affordance — users got stuck at step 1 because
      // they had to find a small "Done" button in the header.
      goToNextStep();
    } catch (err: unknown) {
      // BUG-692-FOLLOWUP: Don't surface error alert if user already navigated away.
      if (skipCancelledRef.current) return;
      platformAlert('Could not skip ahead', formatApiError(err));
    }
  }, [
    interviewComplete,
    sessionPhase,
    forceComplete,
    abortStream,
    goToNextStep,
  ]);

  const handleSend = useCallback(
    async (text: string, { isRetry = false } = {}) => {
      if (isStreaming || !subjectId || restartRequired) return;
      // BUG-317: Skip streamError guard when called from retry — the caller
      // already cleared the error and removed orphaned messages.
      if (!isRetry && streamError) return;

      lastSentTextRef.current = text;
      const streamMsgId = `ai-${Date.now()}`;
      setStreamError(null);

      setMessages((prev) => [
        ...prev,
        // On retry, the user message is already in the list — the retry
        // cleanup only removes the error AI bubble. Adding it again would
        // cause a duplicate user bubble and re-send the message to the API.
        ...(isRetry
          ? []
          : [
              {
                id: `user-${Date.now()}`,
                role: 'user' as const,
                content: text,
              },
            ]),
        {
          id: streamMsgId,
          role: 'assistant' as const,
          content: '',
          streaming: true,
        },
      ]);

      // -----------------------------------------------------------------------
      // Session phase: route through the session streaming API.
      // The interview is done — subsequent messages are regular learning exchanges.
      // -----------------------------------------------------------------------
      if (sessionPhase && activeSessionId) {
        try {
          await streamSessionMessage(
            text,
            (accumulated) => {
              const clean = accumulated.trimEnd();
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId ? { ...m, content: clean } : m
                )
              );
            },
            () => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId
                    ? {
                        ...m,
                        content: m.content.trimEnd(),
                        streaming: false,
                      }
                    : m
                )
              );
            },
            activeSessionId
          );
        } catch (err: unknown) {
          const formattedError = formatApiError(err);
          setStreamError(formattedError);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamMsgId
                ? { ...m, content: formattedError, streaming: false }
                : m
            )
          );
        }
        return;
      }

      // -----------------------------------------------------------------------
      // Interview phase: use the interview streaming API.
      // -----------------------------------------------------------------------
      try {
        const outboxEntry =
          activeProfile?.id &&
          (isRetry && lastOutboxEntryRef.current
            ? lastOutboxEntryRef.current
            : await enqueue({
                profileId: activeProfile.id,
                flow: 'interview',
                surfaceKey: `${subjectId}:${bookId ?? ''}`,
                content: text,
                metadata: {
                  subjectId,
                  ...(bookId ? { bookId } : {}),
                },
              }));
        if (outboxEntry && activeProfile?.id) {
          lastOutboxEntryRef.current = outboxEntry;
          await beginAttempt(activeProfile.id, 'interview', outboxEntry.id);
        }

        await streamInterview(
          text,
          (accumulated) => {
            const clean = accumulated.trimEnd();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId ? { ...m, content: clean } : m
              )
            );
          },
          (result) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId
                  ? {
                      ...m,
                      content:
                        result.fallback?.fallbackText ?? m.content.trimEnd(),
                      streaming: false,
                    }
                  : m
              )
            );
            if (result.fallback) {
              if (activeProfile?.id && outboxEntry) {
                void recordFailure(
                  activeProfile.id,
                  'interview',
                  outboxEntry.id,
                  result.fallback.reason
                );
              }
              return;
            }
            if (activeProfile?.id && outboxEntry && !result.isComplete) {
              void markConfirmed(activeProfile.id, 'interview', outboxEntry.id);
              lastOutboxEntryRef.current = null;
            }
            if (result.isComplete) {
              if (activeProfile?.id && outboxEntry) {
                void markConfirmed(
                  activeProfile.id,
                  'interview',
                  outboxEntry.id
                );
                lastOutboxEntryRef.current = null;
              }
              // [BUG-958] Show the completion card so the user sees the final
              // LLM reply and has a clear forward action ("Let's Go").
              // The API route already dispatched the Inngest curriculum-persist
              // event, so curriculum generation is in-flight. Navigating to the
              // curriculum-review screen via goToNextStep() shows a "Building
              // your curriculum…" spinner (BUG-956 fix) until Inngest finishes.
              setInterviewComplete(true);
            }
          },
          outboxEntry
            ? {
                idempotencyKey: outboxEntry.id,
                onReplay: (replay) => {
                  if (activeProfile?.id) {
                    void markConfirmed(
                      activeProfile.id,
                      'interview',
                      outboxEntry.id
                    );
                  }
                  lastOutboxEntryRef.current = null;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamMsgId
                        ? {
                            ...m,
                            content: replay.assistantTurnReady
                              ? 'Previous send restored.'
                              : 'Previous send restored. Waiting for the reply…',
                            streaming: false,
                            isSystemPrompt: true,
                          }
                        : m
                    )
                  );
                },
              }
            : undefined
        );
      } catch (err: unknown) {
        if (activeProfile?.id && lastOutboxEntryRef.current) {
          void recordFailure(
            activeProfile.id,
            'interview',
            lastOutboxEntryRef.current.id,
            err instanceof Error ? err.message : 'stream_failed'
          );
        }
        const formattedError = formatApiError(err);
        setStreamError(formattedError);
        // On stream error, replace the streaming placeholder with error text
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamMsgId
              ? { ...m, content: formattedError, streaming: false }
              : m
          )
        );
      }
    },
    [
      isStreaming,
      restartRequired,
      streamError,
      subjectId,
      streamInterview,
      sessionPhase,
      activeSessionId,
      streamSessionMessage,
      transitionToSession,
      activeProfile?.id,
      bookId,
    ]
  );

  // BUG-316: Show error screen when subjectId is missing — hooks already
  // disable themselves with empty string, but the user sees a dead screen.
  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-5">
        <Text className="text-body text-text-secondary text-center mb-4">
          Missing subject information. Please go back and try again.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="bg-surface-elevated rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          testID="interview-missing-subject-back"
          accessibilityRole="button"
        >
          <Text className="text-text-primary text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Durability layer: drafts can arrive with `completing` (Inngest job running)
  // or `failed` (job exhausted retries). Both states replace the full chat UI
  // so the user sees actionable feedback rather than a frozen screen.
  // ---------------------------------------------------------------------------
  const draftStatus = interviewState.data?.status;

  if (draftStatus === 'completing') {
    return <InterviewCompletingPanel />;
  }

  if (draftStatus === 'failed') {
    return (
      <InterviewFailedPanel
        subjectId={safeSubjectId ?? ''}
        bookId={bookId}
        failureCode={interviewState.data?.failureCode ?? null}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Title & header: once in session phase, drop the "Interview:" prefix and
  // the step indicator so the screen looks like a normal learning session.
  // ---------------------------------------------------------------------------
  const title = sessionPhase
    ? bookTitle ?? subjectName ?? 'Learning'
    : bookTitle
    ? `Interview: ${bookTitle}`
    : `Interview: ${subjectName ?? 'New Subject'}`;

  return (
    <View className="flex-1">
      <ChatShell
        title={title}
        headerBelow={
          !sessionPhase ? (
            <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
          ) : undefined
        }
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        hideInputModeToggle={!sessionPhase}
        inputDisabled={
          (!sessionPhase && interviewComplete) ||
          (sessionPhase && !activeSessionId) ||
          restartRequired ||
          !!streamError
        }
        rightAction={
          sessionPhase ? (
            <Pressable
              onPress={goToNextStep}
              className="px-3 py-2"
              testID="end-session-button"
              accessibilityRole="button"
              accessibilityLabel="End session"
            >
              <Text className="text-body-sm text-primary font-medium">
                Done
              </Text>
            </Pressable>
          ) : (
            <LivingBook
              exchangeCount={exchangeCount}
              isComplete={interviewComplete}
              isExpressive
              onPress={interviewComplete ? goToNextStep : undefined}
            />
          )
        }
        footer={
          sessionPhase && !activeSessionId ? (
            <View
              className="items-center px-4 py-3"
              testID="session-creating-indicator"
            >
              {sessionCreationStuck ? (
                <View className="items-center gap-2">
                  <Text className="text-body-sm text-danger text-center mb-2">
                    This is taking longer than expected.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setSessionCreationStuck(false);
                      sessionCreatingRef.current = false;
                      void transitionToSession();
                    }}
                    className="bg-primary rounded-button px-6 py-3 min-h-[44px] items-center justify-center w-full"
                    testID="session-creating-retry"
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                  >
                    <Text className="text-body font-semibold text-text-inverse">
                      Try Again
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      goBackOrReplace(router, '/(app)/home' as const)
                    }
                    className="bg-surface-elevated rounded-button px-6 py-3 min-h-[44px] items-center justify-center w-full"
                    testID="session-creating-go-back"
                    accessibilityRole="button"
                    accessibilityLabel="Go back to home"
                  >
                    <Text className="text-body font-semibold text-text-primary">
                      Go Back
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <ActivityIndicator size="small" />
                  <Text className="text-body-sm text-text-secondary mt-2">
                    Setting things up…
                  </Text>
                </>
              )}
            </View>
          ) : interviewComplete ? (
            <View className="bg-coaching-card rounded-card p-4 mt-2 mb-4">
              <Text className="text-body font-semibold text-text-primary mb-2">
                Ready to start learning!
              </Text>
              <Text className="text-body-sm text-text-secondary mb-3">
                I've built your first learning path. Review it, make any quick
                changes you want, and start learning.
              </Text>
              <Pressable
                onPress={goToNextStep}
                className="bg-primary rounded-button py-3 items-center"
                testID="view-curriculum-button"
                accessibilityLabel="Start learning"
                accessibilityRole="button"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Let's Go
                </Text>
              </Pressable>
            </View>
          ) : streamError ? (
            <View
              className="bg-danger/10 rounded-card p-4 mt-2 mb-4"
              testID="interview-stream-error"
            >
              <Text className="text-body font-semibold text-text-primary mb-2">
                We hit a problem
              </Text>
              <Text className="text-body-sm text-text-secondary mb-3">
                {streamError}
              </Text>
              <Pressable
                onPress={() => {
                  const lastText = lastSentTextRef.current;
                  setMessages((prev) => {
                    const len = prev.length;
                    if (len >= 1 && prev[len - 1]?.role === 'assistant') {
                      return prev.slice(0, -1);
                    }
                    return prev;
                  });
                  setStreamError(null);
                  if (lastText) {
                    void handleSend(lastText, { isRetry: true });
                  }
                }}
                className="bg-primary rounded-button py-3 items-center"
                testID="interview-try-again-button"
                accessibilityLabel="Try the interview again"
                accessibilityRole="button"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Try Again
                </Text>
              </Pressable>
            </View>
          ) : !sessionPhase &&
            !interviewComplete &&
            !streamError &&
            !restartRequired &&
            exchangeCount >= 2 ? (
            <View className="px-2 mt-1 mb-2">
              {forceCompleteTimedOut ? (
                <View testID="force-complete-timeout-error">
                  <Text className="text-body-sm text-danger text-center mb-2">
                    Setting up your curriculum is taking too long. Check your
                    connection and try again.
                  </Text>
                  <Pressable
                    onPress={() =>
                      goBackOrReplace(router, '/(app)/home' as const)
                    }
                    className="py-2.5 items-center rounded-button bg-surface-elevated"
                    testID="force-complete-timeout-go-back"
                    accessibilityRole="button"
                    accessibilityLabel="Go back to home"
                  >
                    <Text className="text-body-sm text-primary font-medium">
                      Go Back
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => void handleSkipInterview()}
                  disabled={isStreaming || forceComplete.isPending}
                  className={
                    exchangeCount >= 3
                      ? 'bg-primary rounded-button py-3 items-center justify-center min-h-[48px]'
                      : 'py-2.5 items-center rounded-button'
                  }
                  testID="skip-interview-button"
                  accessibilityLabel="Ready to start learning"
                  accessibilityRole="button"
                >
                  <Text
                    className={
                      exchangeCount >= 3
                        ? 'text-body font-semibold text-text-inverse'
                        : 'text-body-sm text-primary font-medium'
                    }
                  >
                    {forceComplete.isPending
                      ? 'Setting up your curriculum...'
                      : exchangeCount >= 3
                      ? "Continue — I'm ready to start learning"
                      : "I'm ready to start learning"}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : restartRequired ? (
            <View className="bg-coaching-card rounded-card p-4 mt-2 mb-4">
              <Text className="text-body font-semibold text-text-primary mb-2">
                Interview expired
              </Text>
              <Text className="text-body-sm text-text-secondary mb-3">
                After 7 days away, we start fresh so your curriculum still
                matches where you are now.
              </Text>
              <Pressable
                onPress={handleRestartInterview}
                className="bg-primary rounded-button py-3 items-center"
                testID="restart-interview-button"
                accessibilityLabel="Restart interview"
                accessibilityRole="button"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Restart Interview
                </Text>
              </Pressable>
            </View>
          ) : undefined
        }
      />
      {activeProfile?.id ? (
        <OutboxFailedBanner profileId={activeProfile.id} flow="interview" />
      ) : null}
    </View>
  );
}
