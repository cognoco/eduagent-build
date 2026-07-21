import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useThemeColors } from '../../lib/theme';

import type { TranslateKey } from '../../i18n';

/** Mic lifecycle as the bar exposes it to assistive tech. */
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
  onSubmitText: (text: string) => void;
  onOpenCamera: () => void;
  onOpenHomework: () => void;
}

export function MentorInputBar({
  unavailable = false,
  onSubmitText,
  onOpenCamera,
  onOpenHomework,
}: MentorInputBarProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [value, setValue] = useState('');
  const hasText = value.trim().length > 0;

  const {
    status: speechStatus,
    transcript,
    isListening,
    startListening,
    stopListening,
    clearTranscript,
    requestMicrophonePermission,
    getMicrophonePermissionStatus,
  } = useSpeechRecognition();

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

  useEffect(
    () => () => {
      // Read through the ref, not a mount-time copy: by unmount the record has
      // usually been replaced by a later capture, and that is the one to close.
      captureRef.current.accepting = false;
    },
    [],
  );

  useEffect(() => {
    if (!unavailable) return;
    captureRef.current.accepting = false;
    void stopListening();
  }, [unavailable, stopListening]);

  // The hook overwrites `transcript` on every result event and has no explicit
  // final flag, so "final" is the established proxy used elsewhere in the app:
  // the capture has stopped and left a non-empty transcript behind.
  useEffect(() => {
    if (isListening) return;
    const finalTranscript = transcript.trim();
    if (!finalTranscript) return;
    const capture = captureRef.current;
    if (!capture.accepting) return;
    capture.accepting = false;
    setValue((prev) =>
      prev.trim() ? `${prev.trim()} ${finalTranscript}` : finalTranscript,
    );
    clearTranscript();
  }, [isListening, transcript, clearTranscript]);

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

  const handleChangeText = useCallback((next: string): void => {
    // Emptying the field is a discard: a transcript still in flight from the
    // current capture must not repopulate what the learner just cleared.
    if (!next.trim()) {
      captureRef.current.accepting = false;
    }
    setValue(next);
  }, []);

  const beginCapture = useCallback(async (): Promise<void> => {
    // A new capture supersedes the previous one: the old record is dropped, so
    // an abandoned capture can no longer claim the draft.
    captureRef.current = { accepting: true };
    await startListening();
  }, [startListening]);

  const handleMicPress = useCallback((): void => {
    if (unavailable) return;
    void (async () => {
      if (isListening) {
        await stopListening();
        return;
      }
      await beginCapture();
    })();
  }, [unavailable, isListening, stopListening, beginCapture]);

  const handleVoiceRecovery = useCallback((): void => {
    void (async () => {
      if (permissionRecovery) {
        const granted = await requestMicrophonePermission();
        if (!granted) return;
      }
      clearTranscript();
      await beginCapture();
    })();
  }, [
    permissionRecovery,
    requestMicrophonePermission,
    clearTranscript,
    beginCapture,
  ]);

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
          testID="mentor-bar-input"
          value={value}
          onChangeText={handleChangeText}
          onSubmitEditing={submit}
          placeholder={t('mentorHome.bar.placeholder')}
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
            disabled: micState === 'disabled',
            busy: micState === 'requesting' || micState === 'processing',
            selected: micState === 'listening',
          }}
          accessibilityValue={{ text: micState }}
          disabled={micState === 'disabled'}
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
          onPress={onOpenHomework}
          className="rounded-full border border-border px-3 py-2"
        >
          <Text className="text-sm font-semibold text-primary">
            {t('mentorHome.bar.homeworkChip')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
