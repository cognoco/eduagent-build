import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble } from '../components/MessageBubble';
import { useThemeColors } from '../lib/theme';
import { useSendInterviewMessage } from '../hooks/use-interview';
import {
  useStreamMessage,
  useStartSession,
  useCloseSession,
} from '../hooks/use-sessions';
import { useCreateAssessment, useSubmitAnswer } from '../hooks/use-assessments';

interface Message {
  id: string;
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
}

const OPENING_MESSAGES: Record<string, string> = {
  interview:
    "Hi! I'm your learning coach. I'd like to get to know you a bit before we start. What made you interested in learning this subject?",
  homework:
    "Got it. Let's work through this together.\n\nWhat do you think the first step is?",
  learning:
    "Great, let's pick up where we left off. What do you remember from our last session?",
  practice:
    "Let's see what you remember.\n\nQuick: what's the key concept we covered?",
  assessment:
    "Time for a knowledge check. I'll ask you a few questions to see how well you've understood the material. Ready?",
  freeform: "What's on your mind? I'm ready when you are.",
};

export default function ChatScreen() {
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
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [escalationRung, setEscalationRung] = useState(1);
  const [isClosing, setIsClosing] = useState(false);

  // For freeform/practice: we create a session on-demand
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    routeSessionId ?? null
  );

  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  const effectiveMode = mode ?? 'freeform';
  const isInterview = effectiveMode === 'interview';
  const isAssessment = effectiveMode === 'assessment';
  const isSessionMode =
    effectiveMode === 'learning' ||
    effectiveMode === 'homework' ||
    effectiveMode === 'freeform' ||
    effectiveMode === 'practice';

  // Hooks (always called, conditionally used)
  const sendInterview = useSendInterviewMessage(subjectId ?? '');
  const startSession = useStartSession(subjectId ?? '');
  const closeSession = useCloseSession(activeSessionId ?? '');
  const { stream: streamMessage } = useStreamMessage(activeSessionId ?? '');
  const createAssessment = useCreateAssessment(subjectId ?? '', topicId ?? '');
  const submitAnswer = useSubmitAnswer(assessmentId ?? '');

  const openingContent =
    OPENING_MESSAGES[effectiveMode] ?? OPENING_MESSAGES.freeform;
  const [messages, setMessages] = useState<Message[]>([
    { id: 'opening', role: 'ai', content: openingContent },
  ]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Simulate streaming animation for interview responses
  const animateResponse = useCallback(
    (response: string, onDone?: () => void) => {
      const streamId = `ai-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: streamId, role: 'ai', content: '', streaming: true },
      ]);
      setIsStreaming(true);

      const tokens = response.split(' ');
      let tokenIndex = 0;

      const interval = setInterval(() => {
        if (tokenIndex >= tokens.length) {
          clearInterval(interval);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId
                ? { ...m, streaming: false, content: response }
                : m
            )
          );
          setIsStreaming(false);
          onDone?.();
          return;
        }
        const partial = tokens.slice(0, tokenIndex + 1).join(' ');
        setMessages((prev) =>
          prev.map((m) => (m.id === streamId ? { ...m, content: partial } : m))
        );
        tokenIndex++;
      }, 40);
    },
    []
  );

  // Create a session on-demand for freeform/practice modes
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

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const userMessage = input.trim();
    setInput('');

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: userMessage },
    ]);

    try {
      if (isInterview && subjectId) {
        const result = await sendInterview.mutateAsync(userMessage);
        animateResponse(result.response, () => {
          if (result.isComplete) {
            setInterviewComplete(true);
          }
        });
      } else if (isAssessment && subjectId && topicId) {
        // Create assessment on first user message if we don't have one
        let currentAssessmentId = assessmentId;
        if (!currentAssessmentId) {
          const created = await createAssessment.mutateAsync();
          currentAssessmentId = created.assessment.id;
          setAssessmentId(currentAssessmentId);
        }

        const result = await submitAnswer.mutateAsync({ answer: userMessage });
        const feedback = result.result.feedback;
        const passed = result.result.passed;

        animateResponse(feedback, () => {
          if (passed) {
            setMessages((prev) => [
              ...prev,
              {
                id: `assessment-done-${Date.now()}`,
                role: 'ai',
                content: `Assessment complete! Your mastery score: ${Math.round(
                  result.result.masteryScore * 100
                )}%`,
              },
            ]);
          }
        });
      } else if (isSessionMode) {
        // Ensure we have a session (creates one for freeform/practice if needed)
        const sid = await ensureSession();
        if (!sid) {
          animateResponse(
            "I'm having trouble starting a session. Please try again."
          );
          return;
        }

        // Real SSE streaming for all session modes
        const streamId = `ai-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          { id: streamId, role: 'ai', content: '', streaming: true },
        ]);
        setIsStreaming(true);

        await streamMessage(
          userMessage,
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
      } else {
        animateResponse(
          "I'm having trouble connecting right now. Please try again."
        );
      }
    } catch {
      animateResponse(
        "I'm having trouble connecting right now. Please try again."
      );
    }
  }, [
    input,
    isStreaming,
    isInterview,
    isAssessment,
    isSessionMode,
    subjectId,
    topicId,
    assessmentId,
    sendInterview,
    streamMessage,
    animateResponse,
    ensureSession,
    createAssessment,
    submitAnswer,
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
                pathname: '/session-summary',
                params: {
                  sessionId: activeSessionId,
                  subjectName: subjectName ?? '',
                  exchangeCount: String(exchangeCount),
                  escalationRung: String(escalationRung),
                },
              });
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

  const headerTitle = isInterview
    ? `Interview: ${subjectName ?? 'New Subject'}`
    : effectiveMode === 'assessment'
    ? 'Knowledge Check'
    : effectiveMode === 'homework'
    ? 'Homework Help'
    : effectiveMode === 'learning'
    ? 'Learning Session'
    : effectiveMode === 'practice'
    ? 'Practice Session'
    : 'Chat';

  const showEndSession =
    !isInterview && !interviewComplete && isSessionMode && exchangeCount > 0;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 bg-surface border-b border-surface-elevated"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="mr-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
        >
          <Text className="text-primary text-h3">←</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {headerTitle}
          </Text>
          <Text className="text-caption text-text-secondary">
            Your coach is here
          </Text>
        </View>
        {showEndSession && (
          <Pressable
            onPress={handleEndSession}
            disabled={isClosing || isStreaming}
            className="ml-2 px-3 py-2 rounded-button bg-surface-elevated min-h-[44px] items-center justify-center"
            testID="end-session-button"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {isClosing ? 'Closing...' : 'Done'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 16 }}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            streaming={msg.streaming}
          />
        ))}

        {/* Interview complete card */}
        {interviewComplete && (
          <View className="bg-coaching-card rounded-card p-4 mt-2 mb-4">
            <Text className="text-body font-semibold text-text-primary mb-2">
              Interview complete!
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              Your personalized curriculum is ready.
            </Text>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/(learner)/curriculum',
                  params: { subjectId },
                })
              }
              className="bg-primary rounded-button py-3 items-center"
              testID="view-curriculum-button"
            >
              <Text className="text-text-inverse text-body font-semibold">
                View Curriculum
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      {!interviewComplete && (
        <View
          className="flex-row items-end px-4 py-3 bg-surface border-t border-surface-elevated"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          <TextInput
            className="flex-1 bg-background rounded-input px-4 py-3 text-body text-text-primary mr-2"
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            multiline
            maxLength={5000}
            returnKeyType="send"
            editable={!isStreaming}
            testID="chat-input"
          />
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || isStreaming}
            className={`rounded-button px-5 py-3 min-h-[44px] min-w-[44px] items-center justify-center ${
              input.trim() && !isStreaming
                ? 'bg-primary'
                : 'bg-surface-elevated'
            }`}
            testID="send-button"
          >
            <Text
              className={`text-body font-semibold ${
                input.trim() && !isStreaming
                  ? 'text-text-inverse'
                  : 'text-text-secondary'
              }`}
            >
              Send
            </Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
