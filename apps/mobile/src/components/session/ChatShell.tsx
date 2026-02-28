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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble, type VerificationBadge } from './MessageBubble';
import { VoiceRecordButton, VoiceTranscriptPreview } from './VoiceRecordButton';
import { VoiceToggle } from './VoiceToggle';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useTextToSpeech } from '../../hooks/use-text-to-speech';
import { useThemeColors } from '../../lib/theme';

export interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  streaming?: boolean;
  escalationRung?: number;
  verificationBadge?: VerificationBadge;
}

/** Verification types that enable voice input/output in the session. */
export type VoiceVerificationType = 'teach_back';

interface ChatShellProps {
  title: string;
  subtitle?: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isStreaming: boolean;
  inputDisabled?: boolean;
  rightAction?: React.ReactNode;
  footer?: React.ReactNode;
  placeholder?: string;
  /** When set to 'teach_back', enables voice input (STT) and output (TTS). */
  verificationType?: VoiceVerificationType | string;
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
  placeholder = 'Type a message...',
  verificationType,
}: ChatShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');

  // Voice is enabled only for teach_back verification type
  const isVoiceSession = verificationType === 'teach_back';

  // Voice toggle — defaults ON for teach_back, session-scoped
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(isVoiceSession);

  // STT hook
  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    clearTranscript,
  } = useSpeechRecognition();

  // TTS hook
  const { speak, stop: stopSpeaking } = useTextToSpeech();

  // Track whether we have a transcript ready for preview
  const [pendingTranscript, setPendingTranscript] = useState('');

  // Track last spoken message id to avoid re-speaking
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Auto-TTS: speak new AI messages when voice is enabled (Option A — complete only)
  useEffect(() => {
    if (!isVoiceSession || !isVoiceEnabled) return;

    // Find the last AI message that is NOT streaming
    const lastAiMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'ai' && !m.streaming);

    if (!lastAiMessage) return;
    if (lastAiMessage.id === lastSpokenIdRef.current) return;
    if (!lastAiMessage.content.trim()) return;

    lastSpokenIdRef.current = lastAiMessage.id;
    speak(lastAiMessage.content);
  }, [messages, isVoiceSession, isVoiceEnabled, speak]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    // Stop TTS when user sends a message
    if (isVoiceSession) stopSpeaking();
    onSend(text);
  }, [input, isStreaming, onSend, isVoiceSession, stopSpeaking]);

  // Voice record button toggle
  const handleVoicePress = useCallback(async () => {
    if (isListening) {
      await stopListening();
      // After stopping, the transcript from the hook may still be empty
      // because expo-speech-recognition updates asynchronously.
      // We snapshot the transcript in the next effect.
    } else {
      setPendingTranscript('');
      // Stop TTS when user starts recording
      stopSpeaking();
      await startListening();
    }
  }, [isListening, stopListening, startListening, stopSpeaking]);

  // Sync transcript from STT hook to pending transcript when recording stops
  useEffect(() => {
    if (!isListening && transcript.trim()) {
      setPendingTranscript(transcript);
    }
  }, [isListening, transcript]);

  // Voice transcript preview actions
  const handleVoiceSend = useCallback(() => {
    if (!pendingTranscript.trim() || isStreaming) return;
    stopSpeaking();
    onSend(pendingTranscript.trim());
    setPendingTranscript('');
    clearTranscript();
  }, [pendingTranscript, isStreaming, onSend, clearTranscript, stopSpeaking]);

  const handleVoiceDiscard = useCallback(() => {
    setPendingTranscript('');
    clearTranscript();
  }, [clearTranscript]);

  const handleVoiceReRecord = useCallback(async () => {
    setPendingTranscript('');
    clearTranscript();
    stopSpeaking();
    await startListening();
  }, [clearTranscript, startListening, stopSpeaking]);

  const handleVoiceToggle = useCallback(() => {
    setIsVoiceEnabled((prev) => {
      if (prev) stopSpeaking(); // muting stops current speech
      return !prev;
    });
  }, [stopSpeaking]);

  // Combine rightAction with VoiceToggle for teach_back sessions
  const headerRightContent = isVoiceSession ? (
    <View className="flex-row items-center">
      <VoiceToggle
        isVoiceEnabled={isVoiceEnabled}
        onToggle={handleVoiceToggle}
      />
      {rightAction}
    </View>
  ) : (
    rightAction
  );

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
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {title}
          </Text>
          <Text className="text-caption text-text-secondary">{subtitle}</Text>
        </View>
        {headerRightContent}
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
            escalationRung={msg.escalationRung}
            verificationBadge={msg.verificationBadge}
          />
        ))}
        {footer}
      </ScrollView>

      {/* Voice transcript preview (above input, only for teach_back) */}
      {isVoiceSession && pendingTranscript && !isListening && (
        <VoiceTranscriptPreview
          transcript={pendingTranscript}
          onSend={handleVoiceSend}
          onDiscard={handleVoiceDiscard}
          onReRecord={handleVoiceReRecord}
        />
      )}

      {/* Input */}
      {!inputDisabled && (
        <View
          className="flex-row items-end px-4 py-3 bg-surface border-t border-surface-elevated"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          <TextInput
            className="flex-1 bg-background rounded-input px-4 py-3 text-body text-text-primary me-2"
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            maxLength={5000}
            returnKeyType="send"
            blurOnSubmit={false}
            editable={!isStreaming}
            testID="chat-input"
            accessibilityLabel="Message input"
          />
          {isVoiceSession && (
            <View className="me-2">
              <VoiceRecordButton
                isListening={isListening}
                onPress={handleVoicePress}
                disabled={isStreaming}
              />
            </View>
          )}
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
            <Ionicons
              name="send"
              size={20}
              color={
                input.trim() && !isStreaming ? colors.textInverse : colors.muted
              }
            />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
