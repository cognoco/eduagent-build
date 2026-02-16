import { useState, useRef, useEffect } from 'react';
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

interface Message {
  id: string;
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
}

const OPENING_MESSAGES: Record<string, Message> = {
  homework: {
    id: '1',
    role: 'ai',
    content:
      "Got it. Let's work through this together.\n\nWhat do you think the first step is?",
  },
  practice: {
    id: '1',
    role: 'ai',
    content:
      "Electromagnetic forces — let's see what you remember.\n\nQuick: what's the relationship between electric charge and force?",
  },
  freeform: {
    id: '1',
    role: 'ai',
    content: "What's on your mind? I'm ready when you are.",
  },
};

const MOCK_RESPONSES = [
  'Good start. Now, what happens when you move to the next step?',
  'Not quite — let me show you on a similar one.\n\nImagine you have 2x + 5 = 15. What would you do first?',
  'You got it. The key pattern here is isolating the variable.\n\nNow try applying that to your original problem.',
  "Still strong. You remembered that from last week.\n\nLet's connect it to something new.",
  "Solid on this. I'll check in 4 days.\n\nTomorrow: we connect this to quadratic formula.",
];

export default function ChatScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { persona } = useTheme();
  const isDark = persona === 'teen';
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [responseIndex, setResponseIndex] = useState(0);

  const openingMsg =
    OPENING_MESSAGES[mode ?? 'freeform'] ?? OPENING_MESSAGES.freeform;
  const [messages, setMessages] = useState<Message[]>([openingMsg]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };
    setInput('');

    const streamingMsg: Message = {
      id: `ai-${Date.now()}`,
      role: 'ai',
      content: '',
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, streamingMsg]);
    setIsStreaming(true);

    // Simulate SSE streaming token-by-token
    const fullResponse = MOCK_RESPONSES[responseIndex % MOCK_RESPONSES.length];
    setResponseIndex((i) => i + 1);
    const tokens = fullResponse.split(' ');
    let tokenIndex = 0;

    const interval = setInterval(() => {
      if (tokenIndex >= tokens.length) {
        clearInterval(interval);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsg.id
              ? { ...m, streaming: false, content: fullResponse }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }
      const partial = tokens.slice(0, tokenIndex + 1).join(' ');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMsg.id ? { ...m, content: partial } : m
        )
      );
      tokenIndex++;
    }, 60);
  };

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
            {mode === 'homework'
              ? 'Homework Help'
              : mode === 'practice'
              ? 'Practice Session'
              : 'Chat'}
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
      </ScrollView>

      {/* Input */}
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
          onSubmitEditing={sendMessage}
          multiline
          maxLength={2000}
          returnKeyType="send"
          editable={!isStreaming}
        />
        <Pressable
          onPress={sendMessage}
          disabled={!input.trim() || isStreaming}
          className={`rounded-button px-5 py-3 ${
            input.trim() && !isStreaming ? 'bg-primary' : 'bg-surface-elevated'
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
    </KeyboardAvoidingView>
  );
}
