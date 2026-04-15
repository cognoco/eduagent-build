import type { InputMode } from '@eduagent/schemas';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  AccessibilityInfo,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Vibration,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble, type VerificationBadge } from './MessageBubble';
import { VoiceRecordButton, VoiceTranscriptPreview } from './VoiceRecordButton';
import { VoiceToggle } from './VoiceToggle';
import { VoicePlaybackBar } from './VoicePlaybackBar';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useTextToSpeech } from '../../hooks/use-text-to-speech';
import { useThemeColors } from '../../lib/theme';
import { goBackOrReplace } from '../../lib/navigation';
import { PenWritingAnimation } from '../common';

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  streaming?: boolean;
  kind?: 'reconnect_prompt' | 'session_expired' | 'quota_exceeded';
  escalationRung?: number;
  verificationBadge?: VerificationBadge;
  eventId?: string;
  isSystemPrompt?: boolean;
  /** BUG-373: True for programmatically auto-sent messages (homework OCR, queued
   *  multi-problem). Used to exclude from userMessageCount so the voice/text
   *  toggle stays visible until the user deliberately sends a message. */
  isAutoSent?: boolean;
}

interface ChatShellProps {
  title: string;
  subtitle?: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isStreaming: boolean;
  inputDisabled?: boolean;
  /** Explains why input is disabled — shown inline where the input area normally appears. */
  disabledReason?: string;
  rightAction?: React.ReactNode;
  footer?: React.ReactNode;
  inputAccessory?: React.ReactNode;
  onDraftChange?: (text: string) => void;
  placeholder?: string;
  renderMessageActions?: (message: ChatMessage) => React.ReactNode;
  /** When set to 'teach_back', voice defaults ON. Otherwise voice defaults OFF but toggle is always visible. */
  verificationType?: string;
  /** Explicit voice mode override from session-start input mode toggle (FR144). Takes precedence over verificationType. */
  initialVoiceEnabled?: boolean;
  inputMode?: InputMode;
  onInputModeChange?: (mode: InputMode) => void;
  speechRecognitionLanguage?: string;
  textToSpeechLanguage?: string;
  /** Compact controls rendered below the text input (e.g. Switch topic / Park it). */
  belowInput?: React.ReactNode;
  /** Optional testID for the message scroll area (used by E2E flows). */
  messagesTestID?: string;
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
    { id: streamId, role: 'assistant', content: '', streaming: true },
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
  subtitle = "I'm here to help",
  messages,
  onSend,
  isStreaming,
  inputDisabled = false,
  disabledReason,
  rightAction,
  footer,
  inputAccessory,
  onDraftChange,
  placeholder = 'Type a message...',
  renderMessageActions,
  verificationType,
  initialVoiceEnabled,
  inputMode,
  onInputModeChange,
  speechRecognitionLanguage,
  textToSpeechLanguage,
  belowInput,
  messagesTestID,
}: ChatShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);

  // Voice toggle — explicit initialVoiceEnabled (from input mode toggle) takes precedence.
  // Falls back to teach_back detection. Session-scoped only — NOT a persistent preference.
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(
    inputMode
      ? inputMode === 'voice'
      : initialVoiceEnabled ?? verificationType === 'teach_back'
  );

  // BUG-349: Sync voice state when inputMode prop changes after mount
  // (useState only reads initial value once, so prop changes were ignored).
  // Guard against the prev value to avoid an extra render on every mode toggle.
  useEffect(() => {
    if (inputMode) {
      const shouldBeVoice = inputMode === 'voice';
      if (isVoiceEnabled !== shouldBeVoice) {
        setIsVoiceEnabled(shouldBeVoice);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode]);

  // STT hook
  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    clearTranscript,
  } = useSpeechRecognition({ lang: speechRecognitionLanguage });

  // TTS hook
  const {
    speak,
    stop: stopSpeaking,
    pause: pauseSpeaking,
    resume: resumeSpeaking,
    replay,
    isSpeaking: ttsPlaying,
    isPaused: ttsPaused,
    rate,
    setRate,
  } = useTextToSpeech({ language: textToSpeechLanguage });

  // Track whether we have a transcript ready for preview
  const [pendingTranscript, setPendingTranscript] = useState('');

  // Track last spoken message id to avoid re-speaking
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) {
        setScreenReaderEnabled(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (enabled) => {
        setScreenReaderEnabled(enabled);
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  // Auto-TTS: speak new AI messages when voice is enabled (Option A — complete only)
  useEffect(() => {
    if (!isVoiceEnabled || screenReaderEnabled) return;

    // Find the last AI message that is NOT streaming
    const lastAiMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.streaming);

    if (!lastAiMessage) return;
    if (lastAiMessage.id === lastSpokenIdRef.current) return;
    if (!lastAiMessage.content.trim()) return;

    lastSpokenIdRef.current = lastAiMessage.id;
    speak(lastAiMessage.content);
  }, [messages, isVoiceEnabled, screenReaderEnabled, speak]);

  // BUG-348: Stop TTS immediately when screen reader activates mid-session
  useEffect(() => {
    if (screenReaderEnabled && ttsPlaying) {
      stopSpeaking();
    }
  }, [screenReaderEnabled, ttsPlaying, stopSpeaking]);

  const setVoiceEnabled = useCallback(
    (enabled: boolean) => {
      setIsVoiceEnabled(enabled);
      // BUG-344: Stop TTS immediately when switching to text mode
      if (!enabled) stopSpeaking();
      onInputModeChange?.(enabled ? 'voice' : 'text');
    },
    [onInputModeChange, stopSpeaking]
  );

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    onDraftChange?.('');
    // Stop TTS when user sends a message — unconditional so it works even
    // if user switched to text mode while TTS was still playing (BUG-344)
    stopSpeaking();
    onSend(text);
  }, [input, isStreaming, onDraftChange, onSend, stopSpeaking]);

  // Voice record button toggle
  const handleVoicePress = useCallback(async () => {
    if (isStreaming) return; // Don't start recording during streaming
    if (isListening) {
      await stopListening();
      Vibration.vibrate(12);
      // After stopping, the transcript from the hook may still be empty
      // because expo-speech-recognition updates asynchronously.
      // We snapshot the transcript in the next effect.
    } else {
      setPendingTranscript('');
      discardedRef.current = false; // BUG-359: allow effect to capture new transcript
      // Stop TTS when user starts recording
      stopSpeaking();
      await startListening();
      Vibration.vibrate(12);
    }
  }, [isStreaming, isListening, stopListening, startListening, stopSpeaking]);

  // BUG-359: Gate to prevent late STT updates from re-populating the
  // transcript after the user taps Discard. Set on discard, cleared on
  // re-record or new recording.
  const discardedRef = useRef(false);

  // Sync transcript from STT hook to pending transcript when recording stops
  useEffect(() => {
    if (discardedRef.current) return;
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
    onDraftChange?.('');
    clearTranscript();
    discardedRef.current = false;
  }, [
    pendingTranscript,
    isStreaming,
    onDraftChange,
    onSend,
    clearTranscript,
    stopSpeaking,
  ]);

  const handleVoiceDiscard = useCallback(() => {
    discardedRef.current = true;
    setPendingTranscript('');
    clearTranscript();
  }, [clearTranscript]);

  const handleVoiceReRecord = useCallback(async () => {
    discardedRef.current = false;
    setPendingTranscript('');
    clearTranscript();
    stopSpeaking();
    await startListening();
  }, [clearTranscript, startListening, stopSpeaking]);

  const handleSelectInputMode = useCallback(
    async (mode: InputMode) => {
      if (mode === 'text') {
        if (!isVoiceEnabled) {
          return;
        }
        stopSpeaking();
        if (isListening) {
          await stopListening();
        }
        setPendingTranscript('');
        clearTranscript();
        setVoiceEnabled(false);
        return;
      }

      if (isVoiceEnabled) {
        return;
      }
      setVoiceEnabled(true);
    },
    [
      isVoiceEnabled,
      stopSpeaking,
      isListening,
      stopListening,
      clearTranscript,
      setVoiceEnabled,
    ]
  );

  // --- Idle "pen writing" animation ---
  // Show a gentle pen animation after 20s of silence when the AI has finished
  // speaking and the student hasn't responded yet. Resets on any user input.
  const IDLE_TIMEOUT_MS = 20_000;
  const [showIdleAnim, setShowIdleAnim] = useState(false);

  const lastMessageIsAi = useMemo(() => {
    const last = messages[messages.length - 1];
    return last?.role === 'assistant' && !last.streaming;
  }, [messages]);

  useEffect(() => {
    // Only start idle timer when AI finished and user hasn't typed anything
    if (!lastMessageIsAi || isStreaming || input.trim()) {
      setShowIdleAnim(false);
      return;
    }
    const timer = setTimeout(() => setShowIdleAnim(true), IDLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [lastMessageIsAi, isStreaming, input, messages.length]);

  const headerRightContent = (
    <View className="flex-row items-center">
      <VoiceToggle
        isVoiceEnabled={isVoiceEnabled}
        onToggle={() =>
          void handleSelectInputMode(isVoiceEnabled ? 'text' : 'voice')
        }
      />
      {rightAction}
    </View>
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 bg-surface border-b border-surface-elevated"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <View className="flex-1 min-w-[60px]">
          <Text
            className="text-body font-semibold text-text-primary"
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {headerRightContent}
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-4 pt-4"
        testID={messagesTestID ?? 'chat-messages'}
        contentContainerStyle={{ paddingBottom: 16 }}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.length === 0 ? (
          <View
            className="flex-1 items-center justify-center py-16"
            testID="chat-empty-state"
          >
            <Text className="text-body text-text-secondary text-center">
              Your conversation will appear here.
            </Text>
          </View>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              streaming={msg.streaming}
              escalationRung={msg.escalationRung}
              verificationBadge={msg.verificationBadge}
              actions={renderMessageActions?.(msg)}
            />
          ))
        )}
        {showIdleAnim && (
          <View className="items-center py-4" testID="idle-pen-animation">
            <PenWritingAnimation size={48} color={colors.muted} />
          </View>
        )}
        {footer}
      </ScrollView>

      {/* BUG-348: Hide VoicePlaybackBar entirely when screen reader is active.
          TTS controls compete with VoiceOver/TalkBack for the audio channel,
          and the Replay button bypasses the auto-TTS suppression. */}
      {isVoiceEnabled && !inputDisabled && !screenReaderEnabled && (
        <VoicePlaybackBar
          isSpeaking={ttsPlaying}
          isPaused={ttsPaused}
          rate={rate}
          onStop={stopSpeaking}
          onPause={pauseSpeaking}
          onResume={resumeSpeaking}
          onReplay={replay}
          onRateChange={setRate}
        />
      )}

      {/* Voice transcript preview (above input, when voice enabled) */}
      {isVoiceEnabled && pendingTranscript && !isListening && (
        <VoiceTranscriptPreview
          transcript={pendingTranscript}
          onSend={handleVoiceSend}
          onDiscard={handleVoiceDiscard}
          onReRecord={handleVoiceReRecord}
        />
      )}

      {/* Input accessory — always visible so subject-resolution chips remain
          actionable even when the text input itself is disabled (BUG-234). */}
      {inputAccessory}

      {/* Input — when disabled, show inline reason instead of hiding entirely */}
      {inputDisabled && disabledReason ? (
        <View
          className="px-4 py-4 bg-surface border-t border-surface-elevated"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          testID="input-disabled-banner"
          accessibilityRole="alert"
        >
          <Text className="text-body-sm text-text-secondary text-center">
            {disabledReason}
          </Text>
        </View>
      ) : !inputDisabled ? (
        <View>
          <View className="px-4 py-2 bg-surface border-t border-surface-elevated">
            <View
              className="flex-row rounded-full bg-surface-elevated p-1"
              testID="input-mode-toggle"
            >
              <Pressable
                onPress={() => void handleSelectInputMode('text')}
                className={
                  !isVoiceEnabled
                    ? 'flex-1 rounded-full bg-background px-4 py-2 items-center'
                    : 'flex-1 rounded-full px-4 py-2 items-center'
                }
                accessibilityRole="button"
                accessibilityState={{ selected: !isVoiceEnabled }}
                accessibilityLabel="Switch to text mode"
                testID="input-mode-text"
              >
                <Text
                  className={
                    !isVoiceEnabled
                      ? 'text-body-sm font-semibold text-text-primary'
                      : 'text-body-sm font-semibold text-text-secondary'
                  }
                >
                  Text mode
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSelectInputMode('voice')}
                className={
                  isVoiceEnabled
                    ? 'flex-1 rounded-full bg-background px-4 py-2 items-center'
                    : 'flex-1 rounded-full px-4 py-2 items-center'
                }
                accessibilityRole="button"
                accessibilityState={{ selected: isVoiceEnabled }}
                accessibilityLabel="Switch to voice mode"
                testID="input-mode-voice"
              >
                <Text
                  className={
                    isVoiceEnabled
                      ? 'text-body-sm font-semibold text-text-primary'
                      : 'text-body-sm font-semibold text-text-secondary'
                  }
                >
                  Voice mode
                </Text>
              </Pressable>
            </View>
            {screenReaderEnabled && isVoiceEnabled ? (
              <Text className="text-caption text-text-secondary mt-2">
                Screen reader is on, so voice mode keeps manual playback only.
              </Text>
            ) : null}
          </View>
          <View
            className="flex-row items-end px-4 py-3 bg-surface border-t border-surface-elevated"
            style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          >
            <TextInput
              className="flex-1 bg-background rounded-input px-4 py-3 text-body text-text-primary me-2"
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={(text) => {
                setInput(text);
                onDraftChange?.(text);
              }}
              onSubmitEditing={handleSend}
              maxLength={5000}
              returnKeyType="send"
              autoCapitalize="sentences"
              blurOnSubmit={false}
              editable={!isStreaming}
              testID="chat-input"
              accessibilityLabel="Message input"
            />
            {isVoiceEnabled && (
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
                  input.trim() && !isStreaming
                    ? colors.textInverse
                    : colors.muted
                }
              />
            </Pressable>
          </View>
        </View>
      ) : null}
      {belowInput}
    </KeyboardAvoidingView>
  );
}
