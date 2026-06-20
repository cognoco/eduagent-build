import type { InputMode } from '@eduagent/schemas';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  AppState,
  Image,
  Linking,
  View,
  Text,
  Pressable,
  FlatList,
  type ListRenderItemInfo,
  TextInput,
  KeyboardAvoidingView,
  Vibration,
  Platform,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble, type VerificationBadge } from './MessageBubble';
import { VoiceRecordButton, VoiceTranscriptPreview } from './VoiceRecordButton';
import { VoiceToggle } from './VoiceToggle';
import { VoicePlaybackBar } from './VoicePlaybackBar';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useStickyLoading } from '../../hooks/use-sticky-loading';
import { useTextToSpeech } from '../../hooks/use-text-to-speech';
import { useAnnounce } from '../../hooks/use-announce';
import { stripEnvelopeJson } from '../../lib/strip-envelope';
import { useThemeColors } from '../../lib/theme';
import { goBackOrReplace } from '../../lib/navigation';
import { platformAlert } from '../../lib/platform-alert';
import { DeskLampAnimation, MagicPenAnimation } from '../common';
import Animated, { FadeOut } from 'react-native-reanimated';

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  streaming?: boolean;
  outboxStatus?: 'pending' | 'permanently-failed';
  kind?: 'reconnect_prompt' | 'session_expired' | 'quota_exceeded';
  escalationRung?: number;
  verificationBadge?: VerificationBadge;
  eventId?: string;
  isSystemPrompt?: boolean;
  /** BUG-373: True for programmatically auto-sent messages (homework OCR, queued
   *  multi-problem). Used to exclude from userMessageCount so the voice/text
   *  toggle stays visible until the user deliberately sends a message. */
  isAutoSent?: boolean;
  /** Local file URI of a homework image attached to this message */
  imageUri?: string;
}

interface ChatShellProps {
  title: string;
  subtitle?: string;
  headerBelow?: React.ReactNode;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isStreaming: boolean;
  inputDisabled?: boolean;
  /** Explains why input is disabled — shown inline where the input area normally appears. */
  disabledReason?: string;
  /** When false, hides the disabled banner entirely while keeping the composer unavailable. */
  showDisabledBanner?: boolean;
  rightAction?: React.ReactNode;
  footer?: React.ReactNode;
  footerScrollSignal?: unknown;
  inputAccessory?: React.ReactNode;
  /** Compact controls rendered in the composer toolbar beside voice playback. */
  composerAccessory?: React.ReactNode;
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
  /** Compact controls rendered below the text input. */
  belowInput?: React.ReactNode;
  /** Optional testID for the message scroll area (used by E2E flows). */
  messagesTestID?: string;
  /** Fallback route for the back button when `canGoBack()` is false (BUG-612: web). Defaults to `/(app)/home`. */
  backFallback?: string;
  /** Use the fallback route directly when the parent route is known. */
  backBehavior?: 'history' | 'replace';
  /**
   * [BUG-867] Optional handler that fully replaces the default back-button
   * behavior. Use when the parent must navigate to a typed dynamic route
   * (e.g. `/(app)/shelf/[subjectId]`) — string-templated paths don't always
   * resolve cleanly on web, so the parent supplies the navigation.
   */
  onBackPress?: () => void;
  /**
   * [BUG-887] Hide the Text/Voice mode toggle above the composer. Useful for
   * onboarding-style screens where voice is not offered yet — saves ~50px of
   * vertical space so the composer stays comfortably visible on small phones
   * (Galaxy S10e ~5.8" with the soft keyboard open).
   */
  hideInputModeToggle?: boolean;
  pedagogicalState?: {
    rung: 1 | 2 | 3 | 4 | 5;
    phase: string;
    exchangesUsed: number;
    exchangesMax: number;
  };
  memoryHint?: string;
}

/**
 * Simulates token-by-token streaming animation for non-SSE responses.
 * Returns a cleanup function to cancel the animation.
 */
export function animateResponse(
  response: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
  onDone?: () => void,
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
          m.id === streamId ? { ...m, streaming: false, content: response } : m,
        ),
      );
      setIsStreaming(false);
      onDone?.();
      return;
    }
    const partial = tokens.slice(0, tokenIndex + 1).join(' ');
    setMessages((prev) =>
      prev.map((m) => (m.id === streamId ? { ...m, content: partial } : m)),
    );
    tokenIndex++;
  }, 40);

  return () => clearInterval(interval);
}

export function ChatShell({
  title,
  subtitle,
  headerBelow,
  messages,
  onSend,
  isStreaming,
  inputDisabled = false,
  disabledReason,
  showDisabledBanner = true,
  rightAction,
  footer,
  footerScrollSignal,
  inputAccessory,
  composerAccessory,
  onDraftChange,
  placeholder,
  renderMessageActions,
  verificationType,
  initialVoiceEnabled,
  inputMode,
  onInputModeChange,
  speechRecognitionLanguage,
  textToSpeechLanguage,
  belowInput,
  messagesTestID,
  backFallback,
  backBehavior = 'history',
  onBackPress,
  hideInputModeToggle = true,
  pedagogicalState,
  memoryHint,
}: ChatShellProps) {
  const { t } = useTranslation();
  const resolvedSubtitle = subtitle ?? t('session.chatShell.defaultSubtitle');
  const resolvedPlaceholder =
    placeholder ?? t('session.chatShell.defaultPlaceholder');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  // [BUG-886] On RN Web the Stack mounts every screen simultaneously, so a
  // prior session's ChatShell stays in the DOM with a clickable Send button.
  // Tap-target geometry can route a click on the visually active screen to
  // the offscreen instance and fire its `onSend` (still bound to the prior
  // session's POST URL). useIsFocused returns false on the inactive instance
  // — we use it both to short-circuit handleSend and to remove the dormant
  // input + buttons from the layout/accessibility tree on web.
  const isFocused = useIsFocused();
  const isWebDormant = Platform.OS === 'web' && !isFocused;
  // [BUG-740 / PERF-10] FlatList ref so virtualization kicks in for long
  // sessions. ScrollView previously rendered every message bubble in the
  // tree, growing unbounded — students hit OOM after a few hundred turns.
  const scrollRef = useRef<FlatList<ChatMessage>>(null);
  const [input, setInput] = useState('');
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Hold the desk-lamp "thinking" indicator long enough to perceive even
  // when streaming is fast. The streamed reply renders alongside it for a
  // beat — that's intentional and cheaper than a flicker.
  const showThinking = useStickyLoading(isStreaming, 800);

  // [PERF-10 safeguard] FlatList virtualisation only kicks in when its
  // `data`, `renderItem`, and `keyExtractor` keep stable references across
  // renders — otherwise React re-mounts every row, defeating the bounded-
  // memory guarantee BUG-740 was filed to enforce. ChatShell re-renders on
  // input changes, voice state toggles, screen-reader detection, etc., so
  // we memoise these three explicitly. The filter expression matches the
  // previous inline `messages.filter(...)` exactly — system prompts that
  // have no `kind` are hidden, everything else is shown.
  const visibleMessages = useMemo(
    () => messages.filter((msg) => !(msg.isSystemPrompt && !msg.kind)),
    [messages],
  );
  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);
  const renderMessageItem = useCallback(
    ({ item: msg, index }: ListRenderItemInfo<ChatMessage>) => (
      <View>
        {msg.imageUri && !failedImages.has(msg.id) && (
          <View className="self-end max-w-[85%] mb-1">
            {/* [BUG-NOTION-257] Hint the platform image cache so homework
                thumbnails are not re-decoded on every FlatList scroll-back.
                expo-image is not in the workspace (only expo-image-picker /
                expo-image-manipulator), so we rely on the RN Image cache
                policy. `force-cache` instructs iOS to serve from disk cache
                when present; on Android the prop is a no-op but harmless.
                If/when expo-image is added, swap to <Image contentFit="contain"
                cachePolicy="memory-disk" /> from expo-image. */}
            <Image
              testID={`message-image-${msg.id}`}
              source={{ uri: msg.imageUri, cache: 'force-cache' }}
              className="w-full aspect-[4/3] rounded-lg"
              resizeMode="contain"
              accessibilityLabel={t('session.chatShell.a11yHomeworkImage')}
              onError={() => {
                setFailedImages((prev) => new Set(prev).add(msg.id));
              }}
            />
          </View>
        )}
        {msg.imageUri && failedImages.has(msg.id) && (
          <View className="self-end max-w-[85%] mb-1">
            <View
              testID={`message-image-fallback-${msg.id}`}
              className="w-full aspect-[4/3] rounded-lg bg-surface items-center justify-center"
            >
              <Ionicons name="camera-outline" size={32} color={colors.muted} />
              <Text className="text-body-sm text-text-secondary mt-1">
                {t('session.chatShell.imageUnavailable')}
              </Text>
            </View>
          </View>
        )}
        <MessageBubble
          sender={msg.role}
          content={msg.content}
          streaming={msg.streaming}
          outboxStatus={msg.outboxStatus}
          escalationRung={msg.escalationRung}
          verificationBadge={msg.verificationBadge}
          actions={renderMessageActions?.(msg)}
          testID={`message-bubble-${msg.role}-${index}`}
        />
      </View>
    ),
    [failedImages, colors.muted, renderMessageActions, t],
  );

  // Voice toggle — explicit initialVoiceEnabled (from input mode toggle) takes precedence.
  // Falls back to teach_back detection. Session-scoped only — NOT a persistent preference.
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(
    inputMode
      ? inputMode === 'voice'
      : (initialVoiceEnabled ?? verificationType === 'teach_back'),
  );

  // BUG-349: Sync voice state when inputMode prop changes after mount
  // (useState only reads initial value once, so prop changes were ignored).
  // React bails out on identical state, so no manual prev-value guard needed.
  useEffect(() => {
    if (inputMode) setIsVoiceEnabled(inputMode === 'voice');
  }, [inputMode]);

  // STT hook
  const {
    isListening,
    transcript,
    status: speechStatus,
    error: sttError,
    startListening,
    stopListening,
    clearTranscript,
    requestMicrophonePermission,
    getMicrophonePermissionStatus,
  } = useSpeechRecognition({ lang: speechRecognitionLanguage });

  // Proactively prompt for microphone on session entry so voice input is
  // ready without the user hunting for a toggle. Android forbids silent
  // grants for RECORD_AUDIO, so this system dialog on first launch is the
  // closest thing to "allowed by default". Once the user taps Allow, the
  // grant sticks until they explicitly revoke it in Settings.
  useEffect(() => {
    void requestMicrophonePermission();
  }, [requestMicrophonePermission]);

  // BUG-141: STT permission detection must classify-before-format. Previously
  // this branch string-matched `sttError.toLowerCase().includes('permission')`,
  // which silently breaks if the hook's canonical message ever changes (e.g.
  // localization, OEM substitution) and also false-matches any error string
  // that mentions the word "permission". Instead, classify against the OS
  // permission-status enum (granted/canAskAgain) — structured data the hook
  // already exposes via getMicrophonePermissionStatus().
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;

      void (async () => {
        try {
          // Only act if the hook is currently in error state. Reading the live
          // OS permission status here is the authoritative classifier — if it
          // is now granted while the hook still reports error, the error was
          // a stale permission-denial. No string matching required.
          if (speechStatus !== 'error') return;
          const permissionStatus = await getMicrophonePermissionStatus();
          if (permissionStatus?.granted) {
            clearTranscript();
          }
        } catch {
          /* non-fatal */
        }
      })();
    });

    return () => sub.remove();
  }, [clearTranscript, getMicrophonePermissionStatus, speechStatus]);

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

  // Track last announced message id to avoid re-announcing to screen reader
  const lastAnnouncedIdRef = useRef<string | null>(null);

  const announce = useAnnounce();

  // Snap to bottom on every message change. animated:false is intentional —
  // animated scroll from the top to the bottom of a long transcript (resumed
  // sessions) can stall short of the end when interrupted by onContentSizeChange
  // events from async bubble layout. Snap is what chat UIs typically do anyway.
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [messages, footerScrollSignal]);

  useEffect(() => {
    // [BUG-928] On web, AccessibilityInfo.isScreenReaderEnabled() returns
    // true on Chromium-based browsers whenever the accessibility tree is
    // generated for performance reasons (Chromium's AXMode), even with no
    // assistive tech actually running. Auto-suppressing TTS based on that
    // signal silently disables voice output for ordinary Chrome users.
    // Native (iOS/Android) reports accurately, so we keep the listener
    // there. Web users who actually use AT can disable voice manually via
    // the VoiceToggle.
    if (Platform.OS === 'web') return;

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
      },
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

    const spokenText = stripEnvelopeJson(lastAiMessage.content).trim();
    if (!spokenText) return;
    lastSpokenIdRef.current = lastAiMessage.id;
    speak(spokenText);
  }, [messages, isVoiceEnabled, screenReaderEnabled, speak]);

  // BUG-348: Stop TTS immediately when screen reader activates mid-session
  useEffect(() => {
    if (screenReaderEnabled && ttsPlaying) {
      stopSpeaking();
    }
  }, [screenReaderEnabled, ttsPlaying, stopSpeaking]);

  // SR announce: announce completed assistant replies to screen-reader users (F-050).
  // Mirrors the Auto-TTS effect but fires only when screen reader is on (inverse guard).
  // Announces the full reply content so the user hears the message without navigating.
  useEffect(() => {
    if (!screenReaderEnabled) return;

    const lastAiMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.streaming);

    if (!lastAiMessage) return;
    if (lastAiMessage.id === lastAnnouncedIdRef.current) return;
    if (!lastAiMessage.content.trim()) return;

    const spokenText = stripEnvelopeJson(lastAiMessage.content).trim();
    lastAnnouncedIdRef.current = lastAiMessage.id;
    announce(spokenText || t('session.chatShell.replyReady'));
  }, [messages, screenReaderEnabled, announce, t]);

  const setVoiceEnabled = useCallback(
    (enabled: boolean) => {
      setIsVoiceEnabled(enabled);
      // BUG-344: Stop TTS immediately when switching to text mode
      if (!enabled) stopSpeaking();
      onInputModeChange?.(enabled ? 'voice' : 'text');
    },
    [onInputModeChange, stopSpeaking],
  );

  const handleSend = useCallback(() => {
    // [BUG-886 / CCR PR #268] Hard guard against stale-instance taps on RN
    // Web. Without this, a prior screen's ChatShell still in the DOM can
    // fire onSend bound to the prior session's POST URL when the user taps
    // the visually active Send button. The accessibility-tree changes below
    // are the primary defense; this is the belt-and-braces backstop.
    //
    // IMPORTANT: gate on `isWebDormant` (web-only), NOT cross-platform
    // `!isFocused`. On native (iOS/Android) the navigator only mounts the
    // focused screen, so the stale-instance race does not exist — and
    // `useIsFocused()` can race with the keyboard losing focus mid-tap,
    // silently dropping legitimate Sends. Aligns with the same gating used
    // by `editable` / `disabled` on the input row and Send Pressable.
    if (isWebDormant) return;
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    onDraftChange?.('');
    // Stop TTS when user sends a message — unconditional so it works even
    // if user switched to text mode while TTS was still playing (BUG-344)
    stopSpeaking();
    onSend(text);
  }, [input, isWebDormant, isStreaming, onDraftChange, onSend, stopSpeaking]);

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

  const pendingVoiceStartRef = useRef(false);

  const handleEnableVoiceAndRecord = useCallback(() => {
    if (isStreaming) return;
    if (!isVoiceEnabled) {
      pendingVoiceStartRef.current = true;
      setVoiceEnabled(true);
      return;
    }
    void handleVoicePress();
  }, [handleVoicePress, isStreaming, isVoiceEnabled, setVoiceEnabled]);

  // BUG-359: Gate to prevent late STT updates from re-populating the
  // transcript after the user taps Discard. Set on discard, cleared on
  // re-record or new recording.
  const discardedRef = useRef(false);

  useEffect(() => {
    if (!pendingVoiceStartRef.current || !isVoiceEnabled) return;
    pendingVoiceStartRef.current = false;
    void handleVoicePress();
  }, [handleVoicePress, isVoiceEnabled]);

  // Sync transcript from STT hook to pending transcript when recording stops
  useEffect(() => {
    if (discardedRef.current) return;
    if (!isListening && transcript.trim()) {
      setPendingTranscript(transcript);
    }
  }, [isListening, transcript]);

  // Surface STT errors — previously swallowed silently.
  // BUG-141: Classify-before-format. Use the OS permission-status enum from
  // the speech-recognition hook as the authoritative signal rather than
  // string-matching the error message (which silently breaks if the hook's
  // canonical wording changes and false-matches unrelated errors that happen
  // to contain the word "permission"). String matching remains as a strict
  // last-resort fallback for the case where the permission lookup itself
  // throws or the module is unavailable.
  useEffect(() => {
    if (!sttError) return;
    let cancelled = false;
    void (async () => {
      let isPermissionError = false;
      try {
        const permissionStatus = await getMicrophonePermissionStatus();
        if (permissionStatus) {
          // Structured classification: hook is in error AND OS reports
          // permission is not granted ⇒ permission-denied error.
          isPermissionError = !permissionStatus.granted;
        }
      } catch {
        /* fall through to the last-resort fallback below */
      }
      if (cancelled) return;
      platformAlert(
        t('session.chatShell.voicePermissionErrorTitle'),
        isPermissionError
          ? t('session.chatShell.voicePermissionErrorMessage')
          : sttError,
        isPermissionError
          ? [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('session.chatShell.voicePermissionOpenSettings'),
                onPress: () => Linking.openSettings(),
              },
            ]
          : undefined,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [sttError, getMicrophonePermissionStatus]);

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
    ],
  );

  // --- Idle "magic pen" animation ---
  // Show a gentle pen animation after idle timeout when the AI has finished
  // speaking and the student hasn't responded. Threshold is a tuning candidate
  // (consider 12-15s for younger users). Resets on any user input.
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
    // `lastMessageIsAi` already derives from `messages` — adding
    // `messages.length` here caused cascading re-renders on web (Enter key
    // with blurOnSubmit=false) because setInput + onSend + setMessages all
    // fired in the same React batch, triggering the effect multiple times.
  }, [lastMessageIsAi, isStreaming, input]);

  const headerRightContent = (
    <View
      className="flex-row flex-wrap items-center justify-end"
      style={{ flexShrink: 1, maxWidth: '70%' }}
      testID="chat-shell-header-actions"
    >
      {!isWebDormant && (
        <VoiceToggle
          isVoiceEnabled={isVoiceEnabled}
          onToggle={() =>
            void handleSelectInputMode(isVoiceEnabled ? 'text' : 'voice')
          }
        />
      )}
      {rightAction}
    </View>
  );
  const showVoicePlaybackControls =
    isVoiceEnabled && !inputDisabled && !screenReaderEnabled && !isWebDormant;
  const showComposerToolbar = showVoicePlaybackControls || !!composerAccessory;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        className="bg-surface border-b border-surface-elevated"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => {
              // [BUG-867] If the parent supplied an explicit handler, defer
              // entirely to it — the parent owns the destination (typed
              // dynamic routes that string hrefs can miss on web).
              if (onBackPress) {
                onBackPress();
                return;
              }
              const fallback = (backFallback ?? '/(app)/home') as '/(app)/home';
              if (backBehavior === 'replace') {
                router.replace(fallback as Href);
                return;
              }

              goBackOrReplace(router, fallback);
            }}
            className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel={t('common.goBackAction')}
            accessibilityRole="button"
            testID="chat-shell-back"
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
            {pedagogicalState ? (
              <View
                testID="escalation-rung-strip"
                className="flex-row items-center gap-1.5 mt-1"
              >
                {__DEV__ ? (
                  // BUG-140: Internal engine telemetry is dev-only. Production
                  // users (incl. 11-17yo learners) never see RUNG/PHASE jargon
                  // — that violates the "no app jargon" rule.
                  <>
                    <Text
                      testID="escalation-rung-debug-label"
                      className="text-[10px] text-text-tertiary tracking-wide"
                      style={{
                        fontFamily: Platform.select({
                          ios: 'Menlo',
                          android: 'monospace',
                          default: 'monospace',
                        }),
                      }}
                    >
                      RUNG {pedagogicalState.rung} · {pedagogicalState.phase}
                    </Text>
                    <View className="w-[3px] h-[3px] rounded-full bg-text-tertiary" />
                  </>
                ) : null}
                {/* BUG-145: Reframe "X of Y exchanges" (countdown-of-failure) as
                    positive progress copy. Only show when there is meaningful
                    progress to communicate (>=1 exchange used). */}
                {pedagogicalState.exchangesUsed > 0 ? (
                  <Text
                    testID="pedagogical-progress-label"
                    className="text-[10px] text-text-tertiary tracking-wide"
                  >
                    {t('session.chatShell.stepProgress', {
                      current: pedagogicalState.exchangesUsed,
                      total: pedagogicalState.exchangesMax,
                    })}
                  </Text>
                ) : null}
              </View>
            ) : resolvedSubtitle ? (
              <Text className="text-xs text-text-secondary">
                {resolvedSubtitle}
              </Text>
            ) : null}
          </View>
          {headerRightContent}
        </View>
        {headerBelow ? <View className="px-4 pb-3">{headerBelow}</View> : null}
      </View>

      {memoryHint ? (
        <View
          testID="chat-memory-hint"
          className="bg-surface rounded-xl px-3 py-2 mx-4 mb-2 flex-row items-center"
          style={{ gap: 8 }}
        >
          <View className="w-1.5 h-1.5 rounded-full bg-accent" />
          <Text className="text-xs text-text-secondary flex-1">
            {memoryHint}
          </Text>
        </View>
      ) : null}

      {/* Messages — [BUG-740 / PERF-10] FlatList virtualises the message list
          so the bubble tree stays bounded on long sessions. The ScrollView
          version rendered every message in memory, OOM-ing students after a
          few hundred turns. ListFooterComponent carries the streaming
          spinner, idle pen animation, and any caller-provided footer so
          they remain pinned below the messages. */}
      <FlatList
        ref={scrollRef}
        className="flex-1 px-4 pt-4"
        testID={messagesTestID ?? 'chat-messages'}
        contentContainerStyle={{ paddingBottom: 16 }}
        data={visibleMessages}
        keyExtractor={keyExtractor}
        // Virtualization knobs tuned for chat: keep recent context warm for
        // jump-to-bottom snappiness, drop offscreen older bubbles to bound
        // memory. removeClippedSubviews is intentionally true on Android
        // even though it can be flaky with absolute-positioned children —
        // MessageBubble does not use absolute positioning, so it is safe.
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: false })
        }
        renderItem={renderMessageItem}
        ListEmptyComponent={
          <View
            className="flex-1 items-center justify-center py-16"
            testID="chat-empty-state"
          >
            <Text className="text-body text-text-secondary text-center">
              {t('session.chatShell.emptyState')}
            </Text>
          </View>
        }
        ListFooterComponent={
          <>
            {showThinking && (
              <View
                className="items-center py-4"
                testID="thinking-bulb-animation"
              >
                <DeskLampAnimation size={80} />
              </View>
            )}
            {showIdleAnim && (
              <Animated.View
                className="items-center py-4"
                testID="idle-pen-animation"
                exiting={FadeOut.duration(200)}
              >
                <MagicPenAnimation size={80} color={colors.primary} />
              </Animated.View>
            )}
            {footer}
          </>
        }
      />

      {/* Live transcript while recording — gives immediate visual feedback */}
      {isVoiceEnabled && isListening && !isWebDormant && (
        <View
          className="mx-4 mb-2 p-3 bg-surface-elevated rounded-xl"
          testID="voice-listening-indicator"
        >
          <Text className="text-caption text-text-secondary mb-1">
            {t('session.chatShell.listening')}
          </Text>
          {transcript.trim() ? (
            <Text className="text-body text-text-primary">{transcript}</Text>
          ) : (
            <Text className="text-body text-text-tertiary">
              {t('session.chatShell.speakNow')}
            </Text>
          )}
        </View>
      )}

      {/* Processing indicator — shown while STT finalises the result */}
      {isVoiceEnabled && speechStatus === 'processing' && !isWebDormant && (
        <View className="mx-4 mb-1" testID="voice-processing-indicator">
          <Text className="text-caption text-text-secondary">
            {t('session.chatShell.processing')}
          </Text>
        </View>
      )}

      {/* Inline STT error — shown below the mic area instead of only via Alert.
          L2: Tapping the error retries STT so users can escape the error state. */}
      {isVoiceEnabled &&
        speechStatus === 'error' &&
        sttError &&
        !isWebDormant && (
          <Pressable
            className="mx-4 mb-1 min-h-[44px] justify-center"
            onPress={() => void startListening()}
            testID="voice-error-indicator"
            accessibilityRole="button"
            accessibilityLabel={t('session.chatShell.voiceErrorTapRetry', {
              error: sttError,
            })}
            accessibilityHint={t('session.chatShell.a11yVoiceErrorHint')}
          >
            <Text className="text-caption text-error">
              {t('session.chatShell.voiceErrorTapRetry', { error: sttError })}
            </Text>
          </Pressable>
        )}

      {/* Voice transcript preview (above input, when voice enabled) */}
      {isVoiceEnabled && pendingTranscript && !isListening && !isWebDormant && (
        <VoiceTranscriptPreview
          transcript={pendingTranscript}
          onSend={handleVoiceSend}
          onDiscard={handleVoiceDiscard}
          onReRecord={handleVoiceReRecord}
          onTranscriptChange={setPendingTranscript}
        />
      )}

      {/* Input accessory — always visible so subject-resolution chips remain
          actionable even when the text input itself is disabled (BUG-234). */}
      {inputAccessory}

      {/* Composer toolbar — keeps everyday session tools and voice playback in
          one compact shelf instead of stacking multiple white control bands. */}
      {showComposerToolbar ? (
        <View
          className="bg-surface border-t border-surface-elevated px-4 pt-2 pb-1"
          testID="chat-composer-toolbar"
        >
          <View className="flex-row items-center" style={{ gap: 8 }}>
            {/* BUG-348: Hide VoicePlaybackBar entirely when screen reader is
                active. TTS controls compete with VoiceOver/TalkBack for the
                audio channel, and Replay bypasses auto-TTS suppression. */}
            {showVoicePlaybackControls ? (
              <VoicePlaybackBar
                isSpeaking={ttsPlaying}
                isPaused={ttsPaused}
                rate={rate}
                onStop={stopSpeaking}
                onPause={pauseSpeaking}
                onResume={resumeSpeaking}
                onReplay={replay}
                onRateChange={setRate}
                variant="inline"
              />
            ) : null}
            {composerAccessory ? (
              <View className="flex-1 min-w-0">{composerAccessory}</View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Input — when disabled, show inline reason instead of hiding entirely.
          H4: Falls back to a generic message when no disabledReason is provided
          so users are never left staring at an empty void with no explanation. */}
      {inputDisabled && showDisabledBanner ? (
        <View
          className="px-4 py-4 bg-surface border-t border-surface-elevated"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          testID="input-disabled-banner"
          accessibilityRole="alert"
        >
          <Text className="text-body-sm text-text-secondary text-center">
            {disabledReason ?? t('session.chatShell.inputUnavailable')}
          </Text>
        </View>
      ) : inputDisabled ? null : (
        <View>
          {!hideInputModeToggle && (
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
                  accessibilityLabel={t('session.chatShell.switchToTextMode')}
                  testID="input-mode-text"
                >
                  <Text
                    className={
                      !isVoiceEnabled
                        ? 'text-body-sm font-semibold text-text-primary'
                        : 'text-body-sm font-semibold text-text-secondary'
                    }
                  >
                    {t('session.chatShell.textMode')}
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
                  accessibilityLabel={t('session.chatShell.switchToVoiceMode')}
                  testID="input-mode-voice"
                >
                  <Text
                    className={
                      isVoiceEnabled
                        ? 'text-body-sm font-semibold text-text-primary'
                        : 'text-body-sm font-semibold text-text-secondary'
                    }
                  >
                    {t('session.chatShell.voiceMode')}
                  </Text>
                </Pressable>
              </View>
              {screenReaderEnabled && isVoiceEnabled ? (
                <Text className="text-caption text-text-secondary mt-2">
                  {t('session.chatShell.screenReaderVoiceNote')}
                </Text>
              ) : null}
            </View>
          )}
          <View
            className={`flex-row items-end px-4 bg-surface ${
              showComposerToolbar
                ? 'pt-1'
                : 'py-3 border-t border-surface-elevated'
            }`}
            testID="chat-input-row"
            // [BUG-886] On RN Web, mounted-but-unfocused screens stay in the
            // DOM. Remove the input row from the AT tree, swallow pointer
            // events, and skip tab order so a click on the visible screen
            // cannot land on this dormant ChatShell's Send.
            pointerEvents={isWebDormant ? 'none' : 'auto'}
            aria-hidden={isWebDormant ? true : undefined}
            tabIndex={isWebDormant ? -1 : undefined}
            style={[
              { paddingBottom: belowInput ? 8 : Math.max(insets.bottom, 8) },
              isWebDormant ? { display: 'none' } : undefined,
            ]}
          >
            <TextInput
              className="min-h-[52px] flex-1 bg-background rounded-input px-4 py-3 text-body text-text-primary me-2"
              placeholder={resolvedPlaceholder}
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
              // [BUG-886] Disabling here is the second-line guard; the View
              // wrapper above already removes the input from the AT tree on
              // web. Native (iOS/Android) only renders the focused screen so
              // !isFocused effectively never fires there.
              editable={!isStreaming && !isWebDormant}
              testID="chat-input"
              accessibilityLabel={t('session.chatShell.a11yMessageInput')}
            />
            {isVoiceEnabled ? (
              <View className="me-2">
                <VoiceRecordButton
                  isListening={isListening}
                  onPress={handleVoicePress}
                  disabled={
                    isStreaming || speechStatus === 'requesting_permission'
                  }
                />
              </View>
            ) : (
              // [BUG-965] When voice mode is OFF, this enables voice mode
              // before starting the mic. It must NOT share testID="voice-
              // record-button" with the on-state mic — otherwise E2E
              // `assertNotVisible: voice-record-button` fails when voice is
              // off, and consumers can't distinguish the two states.
              <Pressable
                testID="voice-enable-button"
                onPress={handleEnableVoiceAndRecord}
                disabled={
                  isStreaming || speechStatus === 'requesting_permission'
                }
                className="h-[52px] w-[52px] rounded-input bg-surface-elevated items-center justify-center me-2"
                accessibilityLabel={t('session.chatShell.a11yEnableVoice')}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isListening ? 'mic' : 'mic-outline'}
                  size={18}
                  color={isListening ? colors.primary : colors.muted}
                />
              </Pressable>
            )}
            <Pressable
              onPress={handleSend}
              // [BUG-886] Pressable disabled state mirrors handleSend's
              // guard — belt-and-braces against any path that bypasses the
              // wrapping View's pointerEvents/aria-hidden treatment.
              disabled={!input.trim() || isStreaming || isWebDormant}
              className={`h-[52px] w-[52px] rounded-button items-center justify-center ${
                input.trim() && !isStreaming && !isWebDormant
                  ? 'bg-primary'
                  : 'bg-surface-elevated'
              }`}
              testID="send-button"
              accessibilityLabel={t('session.chatShell.a11ySendMessage')}
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
      )}
      {belowInput ? (
        <View
          className="bg-surface"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          testID="below-input-safe-area"
        >
          {belowInput}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
