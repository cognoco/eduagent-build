import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChatShell,
  animateResponse,
  getModeConfig,
  getOpeningMessage,
  SessionTimer,
  QuestionCounter,
  type ChatMessage,
} from '../../../components/session';
import {
  useStreamMessage,
  useStartSession,
  useCloseSession,
} from '../../../hooks/use-sessions';
import { useStreaks } from '../../../hooks/use-streaks';

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
  const sessionExperience = streak?.longestStreak ?? 0;
  const openingContent = getOpeningMessage(
    effectiveMode,
    sessionExperience,
    problemText
  );

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

  const animationCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      animationCleanupRef.current?.();
    };
  }, []);

  const startSession = useStartSession(subjectId ?? '');
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeSessionId) return activeSessionId;
    if (!subjectId) return null;

    const sessionType =
      effectiveMode === 'homework'
        ? ('homework' as const)
        : ('learning' as const);

    try {
      const result = await startSession.mutateAsync({
        subjectId,
        topicId: topicId ?? undefined,
        sessionType,
      });
      const newId = result.session.id;
      setActiveSessionId(newId);
      return newId;
    } catch {
      return null;
    }
  }, [activeSessionId, subjectId, topicId, effectiveMode, startSession]);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
      ]);

      try {
        const sid = await ensureSession();
        if (!sid) {
          animationCleanupRef.current = animateResponse(
            "I'm having trouble starting a session. Please try again.",
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
      } catch {
        animationCleanupRef.current = animateResponse(
          "I'm having trouble connecting right now. Please try again.",
          setMessages,
          setIsStreaming
        );
      }
    },
    [isStreaming, ensureSession, streamMessage]
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
                  subjectName: subjectName ?? '',
                  exchangeCount: String(exchangeCount),
                  escalationRung: String(escalationRung),
                },
              } as never);
            } catch {
              setIsClosing(false);
              Alert.alert(
                'Error',
                'Failed to close session. Please try again.'
              );
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
    subjectName,
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

  return (
    <ChatShell
      title={modeConfig.title}
      subtitle={modeConfig.subtitle}
      placeholder={modeConfig.placeholder}
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      rightAction={headerRight}
      footer={
        modeConfig.showQuestionCount ? (
          <QuestionCounter count={userMessageCount} />
        ) : undefined
      }
    />
  );
}
