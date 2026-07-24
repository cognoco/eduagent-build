import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useThemeColors } from '../../lib/theme';

import type { TranslateKey } from '../../i18n';
import { ColdStartCard } from './ColdStartCard';

/**
 * Mic lifecycle as the bar exposes it to assistive tech. `processing` is the
 * window between the learner stopping and the engine delivering its final
 * result — the mic is deliberately not pressable there, because the capture is
 * not over yet even though nothing is being recorded.
 */
export type MentorMicState =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'processing'
  | 'error'
  | 'disabled';

const MIC_LABEL_KEYS: Record<MentorMicState, TranslateKey> = {
  idle: 'mentorHome.bar.micIdleLabel',
  requesting: 'mentorHome.bar.micRequestingLabel',
  listening: 'mentorHome.bar.micListeningLabel',
  processing: 'mentorHome.bar.micProcessingLabel',
  error: 'mentorHome.bar.micErrorLabel',
  disabled: 'mentorHome.bar.micDisabledLabel',
};

export interface MentorInputBarProps {
  unavailable?: boolean;
  showColdStartPrompts?: boolean;
  /** Rotation cadence for cold-start placeholder examples (ms). Test seam. */
  placeholderRotationIntervalMs?: number;
  /**
   * Voice locale for recognition, resolved by the screen from the active
   * profile's conversation language. Undefined falls back to the hook's
   * default, which is what a learner with no resolved language would get.
   */
  voiceLocale?: string;
  onSubmitText: (text: string) => void;
  onOpenCamera: () => void;
  onOpenHomework: () => void;
}

const COLD_START_PLACEHOLDER_KEYS = [
  'mentorHome.coldStart.placeholderRotation.one',
  'mentorHome.coldStart.placeholderRotation.two',
  'mentorHome.coldStart.placeholderRotation.three',
] as const;

const DEFAULT_PLACEHOLDER_ROTATION_MS = 4000;

export function MentorInputBar({
  unavailable = false,
  showColdStartPrompts = false,
  placeholderRotationIntervalMs = DEFAULT_PLACEHOLDER_ROTATION_MS,
  voiceLocale,
  onSubmitText,
  onOpenCamera,
  onOpenHomework,
}: MentorInputBarProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const hasText = value.trim().length > 0;
  const placeholder = showColdStartPrompts
    ? t(
        COLD_START_PLACEHOLDER_KEYS[
          placeholderIndex
        ] as (typeof COLD_START_PLACEHOLDER_KEYS)[number],
      )
    : t('mentorHome.bar.placeholder');

  const {
    status: speechStatus,
    transcript,
    isFinalTranscript,
    isListening,
    startListening,
    stopListening,
    clearTranscript,
    requestMicrophonePermission,
    getMicrophonePermissionStatus,
    // Single-utterance capture: the learner taps to ask one thing, so the
    // engine should finalise once and stop rather than run continuously. This
    // makes a final result the definitive end of the capture — there is no
    // later segment to drop, and the mic never shows idle mid-capture.
  } = useSpeechRecognition({ lang: voiceLocale, continuous: false });

  // Capture ownership. A transcript can resolve after the learner has moved on
  // — they emptied the draft, the Mentor went unavailable, or they started a
  // fresh capture. Only the capture that is still owned may write to the draft,
  // and it may do so once: `accepting` is cleared on commit and on every event
  // that invalidates the capture.
  const captureRef = useRef({ accepting: false });
  const [permissionRecovery, setPermissionRecovery] = useState(false);

  const micState: MentorMicState = unavailable
    ? 'disabled'
    : speechStatus === 'requesting_permission'
      ? 'requesting'
      : speechStatus === 'listening'
        ? 'listening'
        : speechStatus === 'processing'
          ? 'processing'
          : speechStatus === 'error'
            ? 'error'
            : 'idle';

  // A start is already in flight in these states. React Native does not treat
  // accessibilityState.busy as a press guard, so the mic has to be genuinely
  // disabled or a second tap would open a concurrent native capture.
  const micBusy = micState === 'requesting' || micState === 'processing';
  const micPressBlocked = micState === 'disabled' || micBusy;

  useEffect(
    () => () => {
      // Read through the ref, not a mount-time copy: by unmount the record has
      // usually been replaced by a later capture, and that is the one to close.
      captureRef.current.accepting = false;
    },
    [],
  );

  useEffect(() => {
    if (!showColdStartPrompts || reduceMotion) return;
    const timer = setInterval(() => {
      setPlaceholderIndex(
        (current) => (current + 1) % COLD_START_PLACEHOLDER_KEYS.length,
      );
    }, placeholderRotationIntervalMs);
    return () => clearInterval(timer);
  }, [placeholderRotationIntervalMs, reduceMotion, showColdStartPrompts]);

  useEffect(() => {
    if (!unavailable) return;
    if (captureRef.current.accepting) {
      captureRef.current.accepting = false;
      clearTranscript();
    }
    void stopListening();
  }, [unavailable, stopListening, clearTranscript]);

  // Only the engine's final result may reach the draft. Stopping does not
  // finalise — the native stop is followed by the true final result — so
  // committing on "no longer listening" would insert the last interim guess
  // and then drop the real sentence when it arrives.
  useEffect(() => {
    if (!isFinalTranscript) return;
    const finalTranscript = transcript.trim();
    if (!finalTranscript) return;
    const capture = captureRef.current;
    if (!capture.accepting) return;
    capture.accepting = false;
    setValue((prev) =>
      prev.trim() ? `${prev.trim()} ${finalTranscript}` : finalTranscript,
    );
    clearTranscript();
  }, [isFinalTranscript, transcript, clearTranscript]);

  // Classify before formatting: the recovery affordance branches on the OS
  // permission state, never on the hook's raw error text.
  useEffect(() => {
    if (speechStatus !== 'error') {
      setPermissionRecovery(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const permission = await getMicrophonePermissionStatus();
      if (cancelled) return;
      setPermissionRecovery(
        Boolean(permission && !permission.granted && permission.canAskAgain),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [speechStatus, getMicrophonePermissionStatus]);

  const submit = (): void => {
    const text = value.trim();
    if (text) {
      onSubmitText(text);
    }
  };

  const fillFromStarter = useCallback(
    (text: string): void => {
      if (captureRef.current.accepting) {
        captureRef.current.accepting = false;
        clearTranscript();
        void stopListening();
      }
      setValue((current) => (current.trim() ? current : text));
      inputRef.current?.focus();
    },
    [clearTranscript, stopListening],
  );

  const handleChangeText = useCallback(
    (next: string): void => {
      // Emptying the field is a discard: a transcript still in flight from the
      // current capture must not repopulate what the learner just cleared. The
      // test is emptiness, not blankness — typing a space is not a discard.
      if (next.length === 0 && captureRef.current.accepting) {
        captureRef.current.accepting = false;
        clearTranscript();
      }
      setValue(next);
    },
    [clearTranscript],
  );

  const beginCapture = useCallback(async (): Promise<void> => {
    // A new capture supersedes the previous one: the old record is dropped, so
    // an abandoned capture can no longer claim the draft. Drop whatever the
    // hook still holds first — it only clears its transcript once permission
    // resolves, and the renders before that would otherwise let words from an
    // invalidated capture land in the draft under the new capture's ownership.
    clearTranscript();
    captureRef.current = { accepting: true };
    await startListening();
  }, [clearTranscript, startListening]);

  const handleMicPress = useCallback((): void => {
    if (micPressBlocked) return;
    void (async () => {
      if (isListening) {
        await stopListening();
        return;
      }
      await beginCapture();
    })();
  }, [micPressBlocked, isListening, stopListening, beginCapture]);

  const handleVoiceRecovery = useCallback((): void => {
    void (async () => {
      if (permissionRecovery) {
        const granted = await requestMicrophonePermission();
        if (!granted) return;
      }
      // beginCapture clears the hook state, which also drops the error.
      await beginCapture();
    })();
  }, [permissionRecovery, requestMicrophonePermission, beginCapture]);

  const recoveryLabel = permissionRecovery
    ? t('mentorHome.bar.voiceAllow')
    : t('mentorHome.bar.voiceRetry');

  return (
    <View
      testID="mentor-input-bar"
      className="rounded-2xl border border-border bg-surface p-4"
    >
      <Text className="mb-3 font-bold text-text-primary">
        {t('mentorHome.bar.title')}
      </Text>
      {unavailable ? (
        <Text className="mb-2 text-xs text-text-secondary">
          {t('mentorHome.bar.unavailable')}
        </Text>
      ) : null}
      <View className="flex-row items-start gap-2">
        <TextInput
          ref={inputRef}
          testID="mentor-bar-input"
          accessibilityLabel={t('mentorHome.bar.title')}
          value={value}
          onChangeText={handleChangeText}
          onSubmitEditing={submit}
          placeholder={placeholder}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          blurOnSubmit
          className="min-h-16 min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-text-primary"
          returnKeyType="send"
        />
        <Pressable
          testID="mentor-bar-send"
          accessibilityRole="button"
          accessibilityLabel={t('session.chatShell.a11ySendMessage')}
          accessibilityState={{ disabled: !hasText }}
          disabled={!hasText}
          onPress={submit}
          className={`h-16 w-12 items-center justify-center rounded-xl ${
            hasText ? 'bg-primary' : 'bg-surface-elevated'
          }`}
        >
          <Ionicons
            name="send"
            size={18}
            color={hasText ? colors.textInverse : colors.muted}
          />
        </Pressable>
      </View>
      {micState === 'listening' ? (
        <Text
          testID="mentor-bar-listening"
          accessibilityLiveRegion="polite"
          className="mt-2 text-xs text-text-secondary"
        >
          {t('mentorHome.bar.listening')}
        </Text>
      ) : null}
      {micState === 'error' ? (
        <View testID="mentor-bar-voice-error" className="mt-2">
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-text-secondary"
          >
            {permissionRecovery
              ? t('mentorHome.bar.voicePermissionError')
              : t('mentorHome.bar.voiceError')}
          </Text>
          <Pressable
            testID="mentor-bar-voice-retry"
            accessibilityRole="button"
            accessibilityLabel={recoveryLabel}
            onPress={handleVoiceRecovery}
            className="mt-2 self-start rounded-full border border-border px-3 py-2"
          >
            <Text className="text-sm font-semibold text-primary">
              {recoveryLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        <Pressable
          testID="mentor-bar-camera"
          accessibilityRole="button"
          accessibilityLabel={t('mentorHome.bar.cameraLabel')}
          onPress={onOpenCamera}
          className="rounded-full border border-border px-3 py-2"
        >
          <Text className="text-text-primary">
            {t('mentorHome.bar.cameraLabel')}
          </Text>
        </Pressable>
        <Pressable
          testID="mentor-bar-mic"
          accessibilityRole="button"
          accessibilityLabel={t(MIC_LABEL_KEYS[micState])}
          accessibilityState={{
            disabled: micPressBlocked,
            busy: micBusy,
            selected: micState === 'listening',
          }}
          accessibilityValue={{ text: micState }}
          disabled={micPressBlocked}
          onPress={handleMicPress}
          className="rounded-full border border-border px-3 py-2"
        >
          <Text className="text-text-primary">
            {t('mentorHome.bar.micLabel')}
          </Text>
        </Pressable>
        <Pressable
          testID="mentor-bar-homework-chip"
          accessibilityRole="button"
          accessibilityLabel={t('mentorHome.bar.homeworkChip')}
          onPress={onOpenHomework}
          className="rounded-full border border-border px-3 py-2"
        >
          <Text className="text-sm font-semibold text-primary">
            {t('mentorHome.bar.homeworkChip')}
          </Text>
        </Pressable>
      </View>
      {showColdStartPrompts ? (
        <ColdStartCard onFill={fillFromStarter} onOpenCamera={onOpenCamera} />
      ) : null}
    </View>
  );
}
