import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useThemeColors } from '../../lib/theme';

import type { TranslateKey } from '../../i18n';

/**
 * Shared voice-transcription control for free-text surfaces (WI-2549, the
 * BID-54 voice lane's shared component). Renders a mic button plus its
 * listening / error affordances and hands the engine's FINAL transcript to
 * the parent exactly once per capture, through the surface's existing typed
 * state path. Ports MentorInputBar's hardened capture-ownership semantics:
 * transcription-only (no tone or emotion inference — AI Act Art 5(1)(f)),
 * no raw-audio persistence, and no late-callback injection — a discard
 * (field emptied), a disable (surface submitting / unavailable), an unmount,
 * or a superseding capture all revoke an in-flight capture's right to write.
 */
export type VoiceInputMicState =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'processing'
  | 'error'
  | 'disabled';

const MIC_LABEL_KEYS: Record<VoiceInputMicState, TranslateKey> = {
  idle: 'mentorHome.bar.micIdleLabel',
  requesting: 'mentorHome.bar.micRequestingLabel',
  listening: 'mentorHome.bar.micListeningLabel',
  processing: 'mentorHome.bar.micProcessingLabel',
  error: 'mentorHome.bar.micErrorLabel',
  disabled: 'mentorHome.bar.micDisabledLabel',
};

/** Canonical append: final transcript joins the draft with a single space. */
export function appendTranscript(current: string, transcript: string): string {
  const base = current.trim();
  return base ? `${base} ${transcript}` : transcript;
}

// Module-scoped capture ownership. The native recognizer is a singleton, so
// every mounted control's hook instance receives the SAME result events; if
// two controls are mounted (e.g. Tell Mentor + correction on one screen) and
// both have begun captures, both would otherwise accept the same final
// transcript. Exactly one control — the one that started the most recent
// capture — may commit; beginning a capture takes ownership and silently
// revokes any previous owner's right to commit.
let activeCaptureOwner: symbol | null = null;

export interface VoiceInputControlProps {
  /**
   * Current draft value of the field this control feeds. Emptying it while a
   * capture is in flight is a discard — the capture may no longer commit.
   */
  value: string;
  /** Receives the trimmed final transcript, exactly once per capture. */
  onTranscript: (finalTranscript: string) => void;
  /**
   * Surface unavailable (submitting, read-only, torn down): blocks new
   * captures and revokes any in-flight one.
   */
  disabled?: boolean;
  /** BCP-47 voice locale resolved from the profile's conversation language. */
  voiceLocale?: string;
  /**
   * Identity of the data scope this control writes into (e.g. the child
   * profile id on a child-scoped screen). When it changes while a capture is
   * in flight, the capture is revoked — a late final from the old scope must
   * never append into the new scope's draft.
   */
  scopeKey?: string | number;
  /**
   * Full LITERAL testID for the mic button, written out at the call site
   * (e.g. `testID="tell-mentor-mic"`) so Maestro flows referencing it stay
   * statically discoverable by the e2e-testid-integrity check — a
   * template-built prefix id is invisible to that scan. Affordance testIDs
   * derive from it: `<testID>-listening`, `<testID>-error`, `<testID>-retry`.
   */
  testID?: string;
}

export function VoiceInputControl({
  value,
  onTranscript,
  disabled = false,
  voiceLocale,
  scopeKey,
  testID = 'voice-input-mic',
}: VoiceInputControlProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();

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
    // Single-utterance capture: the engine finalises once and stops, so a
    // final result is the definitive end of the capture.
  } = useSpeechRecognition({ lang: voiceLocale, continuous: false });

  // Capture ownership. A transcript can resolve after the learner has moved
  // on — they emptied the draft, the surface went disabled, or they started a
  // fresh capture. Only the capture that is still owned may commit, and it
  // may do so once: `accepting` is cleared on commit and on every event that
  // invalidates the capture.
  const captureRef = useRef({ accepting: false });
  const ownerTokenRef = useRef(Symbol('voice-input-capture'));
  const [permissionRecovery, setPermissionRecovery] = useState(false);

  const micState: VoiceInputMicState = disabled
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

  // A start is already in flight in these states; accessibilityState.busy is
  // not a press guard, so the mic must be genuinely inert or a second tap
  // would open a concurrent native capture.
  const micBusy = micState === 'requesting' || micState === 'processing';
  const micPressBlocked = micState === 'disabled' || micBusy;

  useEffect(
    () => () => {
      // Read through the ref, not a mount-time copy: by unmount the record
      // has usually been replaced by a later capture. Also actually STOP the
      // native recognizer — revoking acceptance alone would leave the
      // microphone live until the engine gives up on its own, and a control
      // mounted next could collide with that lingering capture.
      captureRef.current.accepting = false;
      if (activeCaptureOwner === ownerTokenRef.current) {
        activeCaptureOwner = null;
      }
      void stopListening();
    },
    [stopListening],
  );

  useEffect(() => {
    if (!disabled) return;
    if (captureRef.current.accepting) {
      captureRef.current.accepting = false;
      clearTranscript();
    }
    void stopListening();
  }, [disabled, stopListening, clearTranscript]);

  // A scope change is a revocation: the capture was spoken into the OLD
  // scope's field, and its late final must not land in the new scope's
  // draft. Transition-sensitive like the empty-draft discard below.
  const prevScopeKeyRef = useRef(scopeKey);
  useEffect(() => {
    const prev = prevScopeKeyRef.current;
    prevScopeKeyRef.current = scopeKey;
    if (prev === scopeKey) return;
    if (captureRef.current.accepting) {
      captureRef.current.accepting = false;
      clearTranscript();
    }
    if (activeCaptureOwner === ownerTokenRef.current) {
      activeCaptureOwner = null;
    }
    void stopListening();
  }, [scopeKey, clearTranscript, stopListening]);

  // A terminal engine error is also a revocation: beginCapture marks the
  // capture accepting before the start settles, so a start failure or native
  // error would otherwise leave the capture authorized and a spurious late
  // final could still commit.
  useEffect(() => {
    if (speechStatus !== 'error') return;
    captureRef.current.accepting = false;
    if (activeCaptureOwner === ownerTokenRef.current) {
      activeCaptureOwner = null;
    }
  }, [speechStatus]);

  // Emptying the field is a discard: a transcript still in flight must not
  // repopulate what the learner just cleared. The test is a transition to
  // emptiness, not initial emptiness — mounting with an empty draft is not a
  // discard.
  const prevValueRef = useRef(value);
  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = value;
    if (prev.length > 0 && value.length === 0 && captureRef.current.accepting) {
      captureRef.current.accepting = false;
      clearTranscript();
    }
  }, [value, clearTranscript]);

  // Only the engine's final result may commit. Stopping does not finalise —
  // the true final arrives afterwards — so committing on "no longer
  // listening" would insert the last interim guess.
  useEffect(() => {
    if (!isFinalTranscript) return;
    const finalTranscript = transcript.trim();
    if (!finalTranscript) return;
    const capture = captureRef.current;
    if (!capture.accepting) return;
    // Ownership gate: only the control that started the most recent capture
    // may commit — a sibling control's still-accepting capture was revoked
    // the moment this one began.
    if (activeCaptureOwner !== ownerTokenRef.current) {
      capture.accepting = false;
      return;
    }
    capture.accepting = false;
    activeCaptureOwner = null;
    onTranscript(finalTranscript);
    clearTranscript();
  }, [isFinalTranscript, transcript, onTranscript, clearTranscript]);

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

  const beginCapture = useCallback(async (): Promise<void> => {
    // A new capture supersedes the previous one — including a sibling
    // control's (module-level ownership). Drop whatever the hook still holds
    // first so words from an invalidated capture cannot land under the new
    // capture's ownership.
    clearTranscript();
    captureRef.current = { accepting: true };
    activeCaptureOwner = ownerTokenRef.current;
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
      await beginCapture();
    })();
  }, [permissionRecovery, requestMicrophonePermission, beginCapture]);

  const recoveryLabel = permissionRecovery
    ? t('mentorHome.bar.voiceAllow')
    : t('mentorHome.bar.voiceRetry');

  return (
    <View>
      <View className="flex-row items-center">
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={t(MIC_LABEL_KEYS[micState])}
          accessibilityState={{
            disabled: micPressBlocked,
            busy: micBusy,
            selected: micState === 'listening',
          }}
          disabled={micPressBlocked}
          onPress={handleMicPress}
          hitSlop={8}
          className="p-2"
        >
          <Ionicons
            name={micState === 'listening' ? 'mic' : 'mic-outline'}
            size={22}
            color={
              micState === 'listening' ? colors.primary : colors.textSecondary
            }
          />
        </Pressable>
        {micState === 'listening' ? (
          <Text
            testID={`${testID}-listening`}
            accessibilityLiveRegion="polite"
            className="text-xs text-text-secondary"
          >
            {t('session.noteInput.listening')}
          </Text>
        ) : null}
      </View>
      {micState === 'error' ? (
        <View testID={`${testID}-error`} className="mt-1">
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-text-secondary"
          >
            {permissionRecovery
              ? t('mentorHome.bar.voicePermissionError')
              : t('mentorHome.bar.voiceError')}
          </Text>
          <Pressable
            testID={`${testID}-retry`}
            accessibilityRole="button"
            accessibilityLabel={recoveryLabel}
            onPress={handleVoiceRecovery}
            className="mt-1 self-start rounded-full border border-border px-3 py-1.5"
          >
            <Text className="text-sm font-semibold text-primary">
              {recoveryLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
