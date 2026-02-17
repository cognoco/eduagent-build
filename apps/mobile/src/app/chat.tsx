import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble } from '../components/MessageBubble';
import { useTheme } from '../lib/theme';
import { useSendInterviewMessage } from '../hooks/use-interview';
import { useStreamMessage } from '../hooks/use-sessions';

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
  freeform: "What's on your mind? I'm ready when you are.",
};

const MOCK_RESPONSES = [
  'Good start. Now, what happens when you move to the next step?',
  'Not quite — let me show you on a similar one.\n\nImagine you have 2x + 5 = 15. What would you do first?',
  'You got it. The key pattern here is isolating the variable.\n\nNow try applying that to your original problem.',
  "Still strong. You remembered that from last week.\n\nLet's connect it to something new.",
  "Solid on this. I'll check in 4 days.\n\nTomorrow: we connect this to quadratic formula.",
];

export default function ChatScreen() {
  const { mode, subjectId, subjectName, sessionId } = useLocalSearchParams<{
    mode?: string;
    subjectId?: string;
    subjectName?: string;
    sessionId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { persona } = useTheme();
  const isDark = persona === 'teen';
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [mockIndex, setMockIndex] = useState(0);

  const effectiveMode = mode ?? 'freeform';
  const isInterview = effectiveMode === 'interview';
  const isSessionMode =
    effectiveMode === 'learning' || effectiveMode === 'homework';

  // Hooks (always called, conditionally used)
  const sendInterview = useSendInterviewMessage(subjectId ?? '');
  const { stream: streamMessage, isStreaming: sseStreaming } = useStreamMessage(
    sessionId ?? ''
  );

  const openingContent =
    OPENING_MESSAGES[effectiveMode] ?? OPENING_MESSAGES.freeform;
  const [messages, setMessages] = useState<Message[]>([
    { id: 'opening', role: 'ai', content: openingContent },
  ]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Simulate streaming animation for a response
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
      } else if (isSessionMode && sessionId) {
        // Real SSE streaming for learning/homework sessions
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
          () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId ? { ...m, streaming: false } : m
              )
            );
            setIsStreaming(false);
          }
        );
      } else {
        // Mock for freeform/practice (Sprint 7 will wire these)
        const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length];
        setMockIndex((i) => i + 1);
        animateResponse(response);
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
    isSessionMode,
    subjectId,
    sessionId,
    sendInterview,
    streamMessage,
    animateResponse,
    mockIndex,
  ]);

  const headerTitle = isInterview
    ? `Interview: ${subjectName ?? 'New Subject'}`
    : effectiveMode === 'homework'
    ? 'Homework Help'
    : effectiveMode === 'learning'
    ? 'Learning Session'
    : effectiveMode === 'practice'
    ? 'Practice Session'
    : 'Chat';

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
        <Pressable onPress={() => router.back()} className="mr-3 p-1">
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
            isDark={isDark}
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
            placeholderTextColor={isDark ? '#525252' : '#94a3b8'}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            multiline
            maxLength={5000}
            returnKeyType="send"
            editable={!isStreaming}
          />
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || isStreaming}
            className={`rounded-button px-5 py-3 ${
              input.trim() && !isStreaming
                ? 'bg-primary'
                : 'bg-surface-elevated'
            }`}
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
