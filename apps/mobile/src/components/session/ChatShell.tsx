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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble } from './MessageBubble';
import { useThemeColors } from '../lib/theme';

export interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
}

interface ChatShellProps {
  title: string;
  subtitle?: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isStreaming: boolean;
  inputDisabled?: boolean;
  rightAction?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Simulates token-by-token streaming animation for non-SSE responses.
 * Returns a cleanup function to cancel the animation.
 */
export function animateResponse(
  response: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
  onDone?: () => void
): () => void {
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
          m.id === streamId ? { ...m, streaming: false, content: response } : m
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

  return () => clearInterval(interval);
}

export function ChatShell({
  title,
  subtitle = 'Your coach is here',
  messages,
  onSend,
  isStreaming,
  inputDisabled = false,
  rightAction,
  footer,
}: ChatShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    onSend(text);
  }, [input, isStreaming, onSend]);

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
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-h3">←</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {title}
          </Text>
          <Text className="text-caption text-text-secondary">{subtitle}</Text>
        </View>
        {rightAction}
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
        {footer}
      </ScrollView>

      {/* Input */}
      {!inputDisabled && (
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
            accessibilityLabel="Message input"
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
            accessibilityLabel="Send message"
            accessibilityRole="button"
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
