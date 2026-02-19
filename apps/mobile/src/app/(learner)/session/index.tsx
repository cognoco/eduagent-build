import { useState, useCallback, useRef, useEffect } from 'react';
import { Text, Pressable, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChatShell,
  animateResponse,
  type ChatMessage,
} from '../../../components/session';
import {
  useStreamMessage,
  useStartSession,
  useCloseSession,
} from '../../../hooks/use-sessions';

const OPENING_MESSAGES: Record<string, string> = {
  homework:
    "Got it. Let's work through this together.\n\nWhat do you think the first step is?",
  learning:
    "Great, let's pick up where we left off. What do you remember from our last session?",
  practice:
    "Let's see what you remember.\n\nQuick: what's the key concept we covered?",
  freeform: "What's on your mind? I'm ready when you are.",
};

const MODE_TITLES: Record<string, string> = {
  homework: 'Homework Help',
  learning: 'Learning Session',
  practice: 'Practice Session',
  freeform: 'Chat',
};

export default function SessionScreen() {
  const {
    mode,
    subjectId,
    subjectName,
    sessionId: routeSessionId,
    topicId,
  } = useLocalSearchParams<{
    mode?: string;
    subjectId?: string;
    subjectName?: string;
    sessionId?: string;
    topicId?: string;
  }>();
  const router = useRouter();

  const effectiveMode = mode ?? 'freeform';
  const openingContent =
    OPENING_MESSAGES[effectiveMode] ?? OPENING_MESSAGES.freeform;

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

    try {
      const result = await startSession.mutateAsync({ subjectId });
      const newId = result.session.id;
      setActiveSessionId(newId);
      return newId;
    } catch {
      return null;
    }
  }, [activeSessionId, subjectId, startSession]);

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
                m.id === streamId ? { ...m, streaming: false } : m
              )
            );
            setIsStreaming(false);
            setExchangeCount(result.exchangeCount);
            setEscalationRung(result.escalationRung);
          }
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

  return (
    <ChatShell
      title={MODE_TITLES[effectiveMode] ?? 'Chat'}
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
      rightAction={
        showEndSession ? (
          <Pressable
            onPress={handleEndSession}
            disabled={isClosing || isStreaming}
            className="ml-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
            testID="end-session-button"
            accessibilityLabel="End session"
            accessibilityRole="button"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {isClosing ? 'Closing...' : 'Done'}
            </Text>
          </Pressable>
        ) : undefined
      }
    />
  );
}
