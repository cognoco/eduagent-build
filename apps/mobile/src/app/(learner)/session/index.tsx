import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
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
  const [classifiedSubject, setClassifiedSubject] = useState<{
    subjectId: string;
    subjectName: string;
  } | null>(null);

  const animationCleanupRef = useRef<(() => void) | null>(null);

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
      setClassifiedSubject(null);
    }, [openingContent, routeSessionId])
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

      // Classify subject from first message when none was provided
      let sessionSubjectId: string | undefined;
      if (!subjectId && !classifiedSubject && messages.length <= 1) {
        setPendingClassification(true);
        try {
          const result = await classifySubject.mutateAsync({ text });
          if (!result.needsConfirmation && result.candidates.length === 1) {
            const candidate = result.candidates[0];
            setClassifiedSubject({
              subjectId: candidate.subjectId,
              subjectName: candidate.subjectName,
            });
            sessionSubjectId = candidate.subjectId;
          }
          // Ambiguous / no match → proceed without subject (freeform)
        } catch {
          // Classification failed — continue without subject
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
          sid
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
    ]
  );

  const hasAutoSentRef = useRef(false);

  useEffect(() => {
    if (problemText && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      const timer = setTimeout(() => {
        handleSend(problemText);
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [problemText, handleSend]);

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
    : apiChecked && !isApiReachable
    ? 'Server unreachable — messages may fail'
    : modeConfig.subtitle;

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
