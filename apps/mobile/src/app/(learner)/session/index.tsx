import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { HomeworkProblem } from '@eduagent/schemas';
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
} from '../../../hooks/use-sessions';
import { useClassifySubject } from '../../../hooks/use-classify-subject';
import { useStreaks } from '../../../hooks/use-streaks';
import { useOverallProgress } from '../../../hooks/use-progress';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { useApiReachability } from '../../../hooks/use-api-reachability';
import { useApiClient } from '../../../lib/api-client';
import { formatApiError } from '../../../lib/format-api-error';
import {
  buildHomeworkSessionMetadata,
  parseHomeworkProblems,
  withProblemMode,
} from '../homework/problem-cards';

export default function SessionScreen() {
  const {
    mode,
    subjectId,
    subjectName,
    sessionId: routeSessionId,
    topicId,
    problemText,
    homeworkProblems,
    ocrText,
  } = useLocalSearchParams<{
    mode?: string;
    subjectId?: string;
    subjectName?: string;
    sessionId?: string;
    topicId?: string;
    problemText?: string;
    homeworkProblems?: string;
    ocrText?: string;
  }>();
  const router = useRouter();

  const effectiveMode = mode ?? 'freeform';
  const initialHomeworkProblems = useMemo(
    () =>
      effectiveMode === 'homework'
        ? parseHomeworkProblems(homeworkProblems, problemText)
        : [],
    [effectiveMode, homeworkProblems, problemText]
  );
  const initialProblemText =
    initialHomeworkProblems[0]?.text ?? problemText ?? undefined;
  const modeConfig = getModeConfig(effectiveMode);
  const { data: streak } = useStreaks();
  const { data: overallProgress } = useOverallProgress();
  const showBookLink =
    effectiveMode !== 'homework' &&
    (overallProgress?.totalTopicsCompleted ?? 0) > 0;
  const sessionExperience = streak?.longestStreak ?? 0;
  const openingContent = getOpeningMessage(
    effectiveMode,
    sessionExperience,
    initialProblemText
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
  const [homeworkProblemsState, setHomeworkProblemsState] = useState<
    HomeworkProblem[]
  >(initialHomeworkProblems);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [homeworkMode, setHomeworkMode] = useState<
    'help_me' | 'check_answer' | undefined
  >(undefined);

  const animationCleanupRef = useRef<(() => void) | null>(null);
  const hasAutoSentRef = useRef(false);
  const queuedProblemTextRef = useRef<string | null>(null);

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
      setHomeworkProblemsState(initialHomeworkProblems);
      setCurrentProblemIndex(0);
      setHomeworkMode(undefined);
      hasAutoSentRef.current = false;
    }, [openingContent, routeSessionId, initialHomeworkProblems])
  );

  useEffect(() => {
    return () => {
      animationCleanupRef.current?.();
    };
  }, []);

  const effectiveSubjectId = classifiedSubject?.subjectId ?? subjectId ?? '';
  const effectiveSubjectName = classifiedSubject?.subjectName ?? subjectName;

  const apiClient = useApiClient();
  const classifySubject = useClassifySubject();
  const startSession = useStartSession(effectiveSubjectId);
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');
  const activeHomeworkProblem = homeworkProblemsState[currentProblemIndex];

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
            Array.isArray(ocrText) ? ocrText[0] : ocrText
          ),
        },
      });

      if (!res.ok) {
        throw new Error(`Homework state sync failed: ${res.status}`);
      }
    },
    [apiClient, effectiveMode, ocrText]
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
              ...(effectiveMode === 'homework' &&
              homeworkProblemsState.length > 0
                ? {
                    metadata: {
                      homework: buildHomeworkSessionMetadata(
                        homeworkProblemsState,
                        currentProblemIndex,
                        Array.isArray(ocrText) ? ocrText[0] : ocrText
                      ),
                    },
                  }
                : {}),
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
            ...(effectiveMode === 'homework' && homeworkProblemsState.length > 0
              ? {
                  metadata: {
                    homework: buildHomeworkSessionMetadata(
                      homeworkProblemsState,
                      currentProblemIndex,
                      Array.isArray(ocrText) ? ocrText[0] : ocrText
                    ),
                  },
                }
              : {}),
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
          } catch {
            // Keep the session alive even if homework metadata sync fails.
          }
        }
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
      homeworkProblemsState,
      currentProblemIndex,
      ocrText,
      syncHomeworkMetadata,
    ]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || pendingClassification) return;

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
      ]);

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

        const streamId = `ai-${Date.now()}`;
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
          (result) => {
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
      activeHomeworkProblem,
      homeworkProblemsState,
      streamMessage,
      effectiveMode,
      homeworkMode,
      currentProblemIndex,
      syncHomeworkMetadata,
    ]
  );

  useEffect(() => {
    if (!queuedProblemTextRef.current) {
      return undefined;
    }

    const queuedProblemText = queuedProblemTextRef.current;
    queuedProblemTextRef.current = null;
    const timer = setTimeout(() => {
      void handleSend(queuedProblemText);
    }, 0);

    return () => clearTimeout(timer);
  }, [currentProblemIndex, handleSend]);

  useEffect(() => {
    if (
      effectiveMode === 'homework' &&
      activeHomeworkProblem &&
      !hasAutoSentRef.current
    ) {
      hasAutoSentRef.current = true;
      const timer = setTimeout(() => {
        handleSend(activeHomeworkProblem.text);
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [effectiveMode, activeHomeworkProblem, handleSend]);

  const handleNextProblem = useCallback(async () => {
    if (
      effectiveMode !== 'homework' ||
      isStreaming ||
      currentProblemIndex >= homeworkProblemsState.length - 1
    ) {
      return;
    }

    const nextProblemIndex = currentProblemIndex + 1;
    const currentProblemId = activeHomeworkProblem?.id;
    const updatedProblems =
      currentProblemId != null
        ? withProblemMode(homeworkProblemsState, currentProblemId, homeworkMode)
        : homeworkProblemsState;

    const nextProblem = updatedProblems[nextProblemIndex];
    if (nextProblem) {
      queuedProblemTextRef.current = nextProblem.text;
    }

    setHomeworkProblemsState(updatedProblems);
    setCurrentProblemIndex(nextProblemIndex);
    setHomeworkMode(undefined);

    if (activeSessionId) {
      try {
        await syncHomeworkMetadata(
          activeSessionId,
          updatedProblems,
          nextProblemIndex
        );
      } catch {
        // Keep the local flow moving even if metadata sync fails.
      }
    }
  }, [
    effectiveMode,
    isStreaming,
    currentProblemIndex,
    homeworkProblemsState,
    activeHomeworkProblem,
    homeworkMode,
    activeSessionId,
    syncHomeworkMetadata,
  ]);

  const handleEndSession = useCallback(async () => {
    if (!activeSessionId || isClosing) return;

    Alert.alert(
      'End Session',
      'Ready to wrap up? You can write a summary of what you learned.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'End Session',
          onPress: async () => {
            setIsClosing(true);
            try {
              await closeSession.mutateAsync();
              router.replace({
                pathname: `/session-summary/${activeSessionId}`,
                params: {
                  subjectName: effectiveSubjectName ?? '',
                  exchangeCount: String(exchangeCount),
                  escalationRung: String(escalationRung),
                  subjectId: effectiveSubjectId ?? '',
                  topicId: topicId ?? '',
                },
              } as never);
            } catch (err: unknown) {
              setIsClosing(false);
              Alert.alert('Error', formatApiError(err));
            }
          },
        },
      ]
    );
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
      accessibilityLabel="End session"
      accessibilityRole="button"
    >
      <Text className="text-body-sm font-semibold text-text-secondary">
        {isClosing ? 'Closing...' : 'Done'}
      </Text>
    </Pressable>
  ) : null;

  const headerRight =
    modeConfig.showTimer || showEndSession ? (
      <View className="flex-row items-center">
        {modeConfig.showTimer && <SessionTimer />}
        {endSessionButton}
      </View>
    ) : undefined;

  const subtitle = pendingClassification
    ? 'Figuring out what this is about...'
    : classifyError
    ? classifyError
    : apiChecked && !isApiReachable
    ? 'Server unreachable — messages may fail'
    : modeConfig.subtitle;

  const homeworkModeChips =
    effectiveMode === 'homework' ? (
      <View className="bg-surface border-t border-surface-elevated">
        {homeworkProblemsState.length > 0 && (
          <View className="flex-row items-center justify-between px-4 pt-3">
            <View>
              <Text
                className="text-body-sm font-semibold text-text-primary"
                testID="homework-problem-progress"
              >
                Problem {currentProblemIndex + 1} of{' '}
                {homeworkProblemsState.length}
              </Text>
              <Text className="text-caption text-text-secondary mt-0.5">
                {activeHomeworkProblem?.text.slice(0, 70) ?? ''}
              </Text>
            </View>
            {currentProblemIndex < homeworkProblemsState.length - 1 && (
              <Pressable
                onPress={handleNextProblem}
                className="rounded-full bg-primary/10 px-3 py-2"
                testID="next-problem-chip"
                accessibilityRole="button"
                accessibilityLabel="Move to the next homework problem"
              >
                <Text className="text-body-sm font-semibold text-primary">
                  Next problem
                </Text>
              </Pressable>
            )}
          </View>
        )}
        <View className="flex-row px-4 py-3 gap-2">
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
      </View>
    ) : undefined;

  return (
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
  );
}
