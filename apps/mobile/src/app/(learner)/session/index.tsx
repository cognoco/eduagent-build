import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AppState, View, Text, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { PendingCelebration } from '@eduagent/schemas';
import {
  ChatShell,
  animateResponse,
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  QuestionCounter,
  LearningBookPrompt,
  type ChatMessage,
} from '../../../components/session';
import {
  useStreamMessage,
  useStartSession,
  useCloseSession,
  useSessionTranscript,
  useRecordSystemPrompt,
} from '../../../hooks/use-sessions';
import { useClassifySubject } from '../../../hooks/use-classify-subject';
import { useStreaks } from '../../../hooks/use-streaks';
import { useOverallProgress } from '../../../hooks/use-progress';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { useApiReachability } from '../../../hooks/use-api-reachability';
import { useCelebrationLevel } from '../../../hooks/use-settings';
import { useCelebration } from '../../../hooks/use-celebration';
import {
  celebrationForReason,
  createMilestoneTrackerStateFromMilestones,
  normalizeMilestoneTrackerState,
  useMilestoneTracker,
} from '../../../hooks/use-milestone-tracker';
import { useApiClient } from '../../../lib/api-client';
import { formatApiError } from '../../../lib/format-api-error';
import {
  clearSessionRecoveryMarker,
  readSessionRecoveryMarker,
  writeSessionRecoveryMarker,
} from '../../../lib/session-recovery';

function computePaceMultiplier(
  history: Array<{ actualSeconds: number; expectedMinutes: number }>
): number {
  if (history.length < 3) return 1;
  const ratios = history
    .map(
      (entry) => entry.actualSeconds / Math.max(60, entry.expectedMinutes * 60)
    )
    .sort((a, b) => a - b);
  const middle = Math.floor(ratios.length / 2);
  const median =
    ratios.length % 2 === 0
      ? (ratios[middle - 1]! + ratios[middle]!) / 2
      : ratios[middle]!;
  return Math.min(3, Math.max(0.5, Number(median.toFixed(2))));
}

function serializeMilestones(milestones: string[]): string {
  return encodeURIComponent(JSON.stringify(milestones));
}

function serializeCelebrations(celebrations: PendingCelebration[]): string {
  return encodeURIComponent(JSON.stringify(celebrations));
}

function MilestoneDots({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <View className="ms-2 flex-row items-center gap-1" testID="milestone-dots">
      {Array.from({ length: Math.min(count, 6) }).map((_, index) => (
        <View key={index} className="w-2 h-2 rounded-full bg-primary" />
      ))}
    </View>
  );
}

export default function SessionScreen() {
  const {
    mode,
    subjectId,
    subjectName,
    sessionId: routeSessionId,
    topicId,
    problemText,
  } = useLocalSearchParams<{
    mode?: string;
    subjectId?: string;
    subjectName?: string;
    sessionId?: string;
    topicId?: string;
    problemText?: string;
  }>();
  const router = useRouter();

  const effectiveMode = mode ?? 'freeform';
  const modeConfig = getModeConfig(effectiveMode);
  const { data: streak } = useStreaks();
  const { data: overallProgress } = useOverallProgress();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const showBookLink =
    effectiveMode !== 'homework' &&
    (overallProgress?.totalTopicsCompleted ?? 0) > 0;
  const sessionExperience = streak?.longestStreak ?? 0;
  const openingContent = getOpeningMessage(
    effectiveMode,
    sessionExperience,
    problemText
  );

  const { isOffline } = useNetworkStatus();
  const { isApiReachable, isChecked: apiChecked } = useApiReachability();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'ai', content: openingContent },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [escalationRung, setEscalationRung] = useState(1);
  const [isClosing, setIsClosing] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    routeSessionId ?? null
  );
  const [pendingClassification, setPendingClassification] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [classifiedSubject, setClassifiedSubject] = useState<{
    subjectId: string;
    subjectName: string;
  } | null>(null);
  const [homeworkMode, setHomeworkMode] = useState<
    'help_me' | 'check_answer' | undefined
  >(undefined);
  const [draftText, setDraftText] = useState('');
  const [resumedBanner, setResumedBanner] = useState(false);
  const [responseHistory, setResponseHistory] = useState<
    Array<{ actualSeconds: number; expectedMinutes: number }>
  >([]);

  const animationCleanupRef = useRef<(() => void) | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAiAtRef = useRef<number | null>(null);
  const lastExpectedMinutesRef = useRef(10);
  const hasAutoSentRef = useRef(false);
  const hasHydratedRecoveryRef = useRef(false);

  const transcript = useSessionTranscript(routeSessionId ?? '');
  const recordSystemPrompt = useRecordSystemPrompt(activeSessionId ?? '');
  const {
    milestonesReached,
    trackerState,
    trackExchange,
    hydrate,
    reset: resetMilestones,
  } = useMilestoneTracker();
  const { CelebrationOverlay, trigger } = useCelebration({
    celebrationLevel,
    audience: 'child',
  });

  // Reset state when screen regains focus (prevents stale state loop)
  useFocusEffect(
    useCallback(() => {
      animationCleanupRef.current?.();
      setMessages([{ id: 'opening', role: 'ai', content: openingContent }]);
      setIsStreaming(false);
      setExchangeCount(0);
      setEscalationRung(1);
      setIsClosing(false);
      setActiveSessionId(routeSessionId ?? null);
      setPendingClassification(false);
      setClassifyError(null);
      setClassifiedSubject(null);
      setDraftText('');
      setResumedBanner(false);
      setResponseHistory([]);
      hasHydratedRecoveryRef.current = false;
      resetMilestones();
    }, [openingContent, resetMilestones, routeSessionId])
  );

  useEffect(() => {
    return () => {
      animationCleanupRef.current?.();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const effectiveSubjectId = classifiedSubject?.subjectId ?? subjectId ?? '';
  const effectiveSubjectName = classifiedSubject?.subjectName ?? subjectName;

  const apiClient = useApiClient();
  const classifySubject = useClassifySubject();
  const startSession = useStartSession(effectiveSubjectId);
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');

  useEffect(() => {
    if (!routeSessionId || !transcript.data) return;

    const transcriptMessages = transcript.data.exchanges
      .filter((entry, index, all) => {
        if (entry.role !== 'user') return true;
        return index !== all.length - 1 || all[index + 1]?.role === 'assistant';
      })
      .map((entry, index) => ({
        id: `${entry.isSystemPrompt ? 'system' : entry.role}-${index}-${
          entry.timestamp
        }`,
        role: entry.role === 'assistant' ? ('ai' as const) : ('user' as const),
        content: entry.content,
        escalationRung: entry.escalationRung,
      }));

    setMessages(
      transcriptMessages.length > 0
        ? transcriptMessages
        : [{ id: 'opening', role: 'ai', content: openingContent }]
    );
    setExchangeCount(transcript.data.session.exchangeCount);
    setEscalationRung(
      transcript.data.exchanges
        .filter((entry) => entry.role === 'assistant' && !entry.isSystemPrompt)
        .at(-1)?.escalationRung ?? 1
    );
    setActiveSessionId(routeSessionId);
    setResumedBanner(true);
  }, [openingContent, routeSessionId, transcript.data]);

  useEffect(() => {
    if (!routeSessionId || hasHydratedRecoveryRef.current) return;

    let cancelled = false;

    void (async () => {
      const marker = await readSessionRecoveryMarker();
      if (cancelled || hasHydratedRecoveryRef.current) return;

      if (marker?.sessionId === routeSessionId && marker.milestoneTracker) {
        hydrate(normalizeMilestoneTrackerState(marker.milestoneTracker));
        hasHydratedRecoveryRef.current = true;
        return;
      }

      const transcriptMilestones =
        transcript.data?.session.milestonesReached ?? [];
      if (transcriptMilestones.length > 0) {
        hydrate(
          createMilestoneTrackerStateFromMilestones(transcriptMilestones)
        );
        hasHydratedRecoveryRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrate, routeSessionId, transcript.data?.session.milestonesReached]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        (nextState === 'background' || nextState === 'inactive') &&
        activeSessionId
      ) {
        void writeSessionRecoveryMarker({
          sessionId: activeSessionId,
          subjectId: effectiveSubjectId || undefined,
          subjectName: effectiveSubjectName || undefined,
          topicId: topicId ?? undefined,
          mode: effectiveMode,
          milestoneTracker: trackerState,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    return () => subscription.remove();
  }, [
    activeSessionId,
    effectiveMode,
    effectiveSubjectId,
    effectiveSubjectName,
    trackerState,
    topicId,
  ]);

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
            { id: 'silence-prompt', role: 'ai', content: prompt },
          ];
        });

        try {
          await recordSystemPrompt.mutateAsync({ content: prompt });
        } catch {
          // Best effort only.
        }

        await writeSessionRecoveryMarker({
          sessionId: sessionIdToUse,
          subjectId: effectiveSubjectId || undefined,
          subjectName: effectiveSubjectName || undefined,
          topicId: topicId ?? undefined,
          mode: effectiveMode,
          milestoneTracker: trackerState,
          updatedAt: new Date().toISOString(),
        });
      }, thresholdMinutes * 60 * 1000);
    },
    [
      draftText,
      effectiveMode,
      effectiveSubjectId,
      effectiveSubjectName,
      recordSystemPrompt,
      responseHistory,
      trackerState,
      topicId,
    ]
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

      try {
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
            },
          });
          if (!res.ok) throw new Error(`Session start failed: ${res.status}`);
          const data = (await res.json()) as { session: { id: string } };
          newId = data.session.id;
        } else {
          const result = await startSession.mutateAsync({
            subjectId: sid,
            topicId: topicId ?? undefined,
            sessionType,
          });
          newId = result.session.id;
        }
        setActiveSessionId(newId);
        return newId;
      } catch {
        return null;
      }
    },
    [
      activeSessionId,
      effectiveSubjectId,
      topicId,
      effectiveMode,
      apiClient,
      startSession,
    ]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || pendingClassification) return;

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
      ]);
      setResumedBanner(false);

      // Classify subject from first message when none was provided
      let sessionSubjectId: string | undefined;
      if (!subjectId && !classifiedSubject && messages.length <= 1) {
        setPendingClassification(true);
        setClassifyError(null);
        try {
          const result = await classifySubject.mutateAsync({ text });
          if (!result.needsConfirmation && result.candidates.length === 1) {
            const candidate = result.candidates[0]!;
            setClassifiedSubject({
              subjectId: candidate.subjectId,
              subjectName: candidate.subjectName,
            });
            sessionSubjectId = candidate.subjectId;
          }
          // Ambiguous / no match → proceed without subject (freeform)
        } catch {
          setClassifyError(
            'Could not identify the subject. Please try again or select one manually.'
          );
        } finally {
          setPendingClassification(false);
        }
      }

      try {
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

        await writeSessionRecoveryMarker({
          sessionId: sid,
          subjectId: (sessionSubjectId ?? effectiveSubjectId) || undefined,
          subjectName: effectiveSubjectName || undefined,
          topicId: topicId ?? undefined,
          mode: effectiveMode,
          milestoneTracker: trackerState,
          updatedAt: new Date().toISOString(),
        });

        const streamId = `ai-${Date.now()}`;
        const previousAiAt = lastAiAtRef.current;
        setMessages((prev) => [
          ...prev,
          { id: streamId, role: 'ai', content: '', streaming: true },
        ]);
        setIsStreaming(true);

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
              prev.map((m) =>
                m.id === streamId
                  ? {
                      ...m,
                      streaming: false,
                      escalationRung: result.escalationRung,
                    }
                  : m
              )
            );
            setIsStreaming(false);
            setExchangeCount(result.exchangeCount);
            setEscalationRung(result.escalationRung);
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
            await writeSessionRecoveryMarker({
              sessionId: sid,
              subjectId: (sessionSubjectId ?? effectiveSubjectId) || undefined,
              subjectName: effectiveSubjectName || undefined,
              topicId: topicId ?? undefined,
              mode: effectiveMode,
              milestoneTracker: nextTrackerState,
              updatedAt: new Date().toISOString(),
            });
          },
          sid,
          effectiveMode === 'homework' && homeworkMode
            ? { homeworkMode }
            : undefined
        );
      } catch (err: unknown) {
        animationCleanupRef.current = animateResponse(
          formatApiError(err),
          setMessages,
          setIsStreaming
        );
      }
    },
    [
      isStreaming,
      pendingClassification,
      subjectId,
      classifiedSubject,
      messages.length,
      classifySubject,
      ensureSession,
      streamMessage,
      effectiveMode,
      effectiveSubjectId,
      effectiveSubjectName,
      homeworkMode,
      scheduleSilencePrompt,
      trackerState,
      topicId,
      trackExchange,
      trigger,
    ]
  );

  useEffect(() => {
    if (problemText && !routeSessionId && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      const timer = setTimeout(() => {
        void handleSend(problemText);
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [problemText, handleSend, routeSessionId]);

  const fetchFastCelebrations = useCallback(async (): Promise<
    PendingCelebration[]
  > => {
    const celebrationsClient = (apiClient as Record<string, any>)[
      'celebrations'
    ];
    const startedAt = Date.now();

    while (Date.now() - startedAt < 3000) {
      const res = await celebrationsClient.pending.$get();
      if (res.ok) {
        const data = (await res.json()) as {
          pendingCelebrations: PendingCelebration[];
        };
        if (data.pendingCelebrations.length > 0) {
          await celebrationsClient.seen.$post({
            json: { viewer: 'child' },
          });
          return data.pendingCelebrations;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return [];
  }, [apiClient]);

  const handleEndSession = useCallback(async () => {
    if (!activeSessionId || isClosing) return;

    Alert.alert('Ready to wrap up?', 'Keep going or finish this session now.', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: "I'm Done",
        onPress: async () => {
          setIsClosing(true);
          try {
            const result = await closeSession.mutateAsync({
              reason: 'user_ended',
              summaryStatus: 'pending',
              milestonesReached,
            });
            const fastCelebrations = await fetchFastCelebrations();
            await clearSessionRecoveryMarker();
            router.replace({
              pathname: `/session-summary/${activeSessionId}`,
              params: {
                subjectName: effectiveSubjectName ?? '',
                exchangeCount: String(exchangeCount),
                escalationRung: String(escalationRung),
                subjectId: effectiveSubjectId ?? '',
                topicId: topicId ?? '',
                wallClockSeconds: String(result.wallClockSeconds),
                milestones: serializeMilestones(milestonesReached),
                fastCelebrations: serializeCelebrations(fastCelebrations),
              },
            } as never);
          } catch (err: unknown) {
            setIsClosing(false);
            Alert.alert('Error', formatApiError(err));
          }
        },
      },
    ]);
  }, [
    activeSessionId,
    isClosing,
    closeSession,
    router,
    effectiveSubjectName,
    effectiveSubjectId,
    topicId,
    exchangeCount,
    escalationRung,
    fetchFastCelebrations,
    milestonesReached,
  ]);

  const showEndSession = exchangeCount > 0;

  const userMessageCount = useMemo(
    () => messages.filter((m) => m.role === 'user').length,
    [messages]
  );

  const endSessionButton = showEndSession ? (
    <Pressable
      onPress={handleEndSession}
      disabled={isClosing || isStreaming}
      className="ms-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
      testID="end-session-button"
      accessibilityLabel="I'm done"
      accessibilityRole="button"
    >
      <Text className="text-body-sm font-semibold text-text-secondary">
        {isClosing ? 'Wrapping up...' : "I'm Done"}
      </Text>
    </Pressable>
  ) : null;

  const headerRight =
    modeConfig.showTimer || showEndSession || milestonesReached.length > 0 ? (
      <View className="flex-row items-center">
        {modeConfig.showTimer && <SessionTimer />}
        <MilestoneDots count={milestonesReached.length} />
        {endSessionButton}
      </View>
    ) : undefined;

  const subtitle = pendingClassification
    ? 'Figuring out what this is about...'
    : classifyError
    ? classifyError
    : resumedBanner
    ? 'Welcome back - your session is ready.'
    : apiChecked && !isApiReachable
    ? 'Server unreachable - messages may fail'
    : modeConfig.subtitle;

  const homeworkModeChips =
    effectiveMode === 'homework' ? (
      <View className="flex-row px-4 pt-3 bg-surface border-t border-surface-elevated gap-2">
        <Pressable
          onPress={() => setHomeworkMode('help_me')}
          className={`flex-1 rounded-button py-2 items-center ${
            homeworkMode === 'help_me' ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="homework-mode-help-me"
          accessibilityRole="button"
          accessibilityLabel="Help me solve it"
          accessibilityState={{ selected: homeworkMode === 'help_me' }}
        >
          <Text
            className={`text-body-sm font-semibold ${
              homeworkMode === 'help_me'
                ? 'text-text-inverse'
                : 'text-text-primary'
            }`}
          >
            Help me solve it
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setHomeworkMode('check_answer')}
          className={`flex-1 rounded-button py-2 items-center ${
            homeworkMode === 'check_answer'
              ? 'bg-primary'
              : 'bg-surface-elevated'
          }`}
          testID="homework-mode-check-answer"
          accessibilityRole="button"
          accessibilityLabel="Check my answer"
          accessibilityState={{ selected: homeworkMode === 'check_answer' }}
        >
          <Text
            className={`text-body-sm font-semibold ${
              homeworkMode === 'check_answer'
                ? 'text-text-inverse'
                : 'text-text-primary'
            }`}
          >
            Check my answer
          </Text>
        </Pressable>
      </View>
    ) : undefined;

  return (
    <View className="flex-1">
      <ChatShell
        title={modeConfig.title}
        subtitle={subtitle}
        placeholder={modeConfig.placeholder}
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        inputDisabled={isOffline || pendingClassification}
        rightAction={headerRight}
        inputAccessory={homeworkModeChips}
        onDraftChange={setDraftText}
        footer={
          modeConfig.showQuestionCount || showBookLink ? (
            <>
              {modeConfig.showQuestionCount && (
                <QuestionCounter count={userMessageCount} />
              )}
              {showBookLink && <LearningBookPrompt />}
            </>
          ) : undefined
        }
      />
      {CelebrationOverlay}
    </View>
  );
}
