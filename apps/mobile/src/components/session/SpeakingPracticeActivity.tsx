import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTextToSpeech } from '../../hooks/use-text-to-speech';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useRecordSpeakingPracticeAttempt } from '../../hooks/use-speaking-practice-api';
import type { LanguageLearningActivityEvent } from '../../lib/sse';
import { SpeakingPracticeCard } from './SpeakingPracticeCard';

export interface SpeakingPracticeActivityProps {
  activity: LanguageLearningActivityEvent;
  sessionId: string;
  subjectId: string;
  textToSpeechLanguage?: string;
}

interface AttemptFeedback {
  missingWords: string[];
  extraWords: string[];
  isComplete: boolean;
}

// WI-1777: renders the repeat-after-me artifact via the existing
// SpeakingPracticeCard, wiring the existing TTS/STT hooks (same pattern as
// GradedInputCard/MeaningOutputCard) and posting a completed recording as an
// attempt. The server's response is the single source of feedback rendered
// (see SpeakingPracticeCard's `missingWords`/`extraWords`/`isComplete` props)
// — this component never computes its own score.
export function SpeakingPracticeActivity({
  activity,
  sessionId,
  subjectId,
  textToSpeechLanguage,
}: SpeakingPracticeActivityProps) {
  const speakingPractice = activity.speakingPractice;
  const { isSpeaking, speak, stop } = useTextToSpeech({
    language: textToSpeechLanguage,
  });
  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    clearTranscript,
  } = useSpeechRecognition({ lang: speakingPractice?.locale });
  const recordAttempt = useRecordSpeakingPracticeAttempt();
  const [feedback, setFeedback] = useState<AttemptFeedback | null>(null);
  const [attemptFailed, setAttemptFailed] = useState(false);
  const wasListeningRef = useRef(false);
  const { t } = useTranslation();

  // Submits exactly once per stop-listening transition, when a non-empty
  // transcript exists. Guarded by `wasListeningRef` so a late STT `result`
  // event arriving after `isListening` has already flipped to false (which
  // re-triggers this effect via the `transcript` dependency) does not
  // double-submit — the ref only enables the false-transition branch once.
  useEffect(() => {
    if (wasListeningRef.current && !isListening) {
      const trimmed = transcript.trim();
      if (trimmed && speakingPractice) {
        setAttemptFailed(false);
        void (async () => {
          try {
            const result = await recordAttempt.mutateAsync({
              sessionId,
              subjectId,
              mode: 'repeat_after_me',
              targetText: speakingPractice.targetText,
              transcript: trimmed,
              locale: speakingPractice.locale,
            });
            setFeedback({
              missingWords: result.missingWords,
              extraWords: result.extraWords,
              isComplete: result.isComplete,
            });
          } catch {
            setAttemptFailed(true);
          }
        })();
      }
    }
    wasListeningRef.current = isListening;
  }, [
    isListening,
    transcript,
    speakingPractice,
    sessionId,
    subjectId,
    recordAttempt,
  ]);

  const handlePlayPress = useCallback(() => {
    if (!speakingPractice) return;
    if (isSpeaking) {
      stop();
      return;
    }
    speak(speakingPractice.targetText);
  }, [speakingPractice, isSpeaking, speak, stop]);

  const handleRecordPress = useCallback(() => {
    if (isListening) {
      void stopListening();
      return;
    }
    setFeedback(null);
    setAttemptFailed(false);
    void startListening();
  }, [isListening, startListening, stopListening]);

  const handleRetry = useCallback(() => {
    // Target text is a prop derived from `activity`, never local state — no
    // code path here can lose it. Only the transcript/feedback reset.
    clearTranscript();
    setFeedback(null);
    setAttemptFailed(false);
  }, [clearTranscript]);

  if (!speakingPractice) {
    return null;
  }

  return (
    <>
      <SpeakingPracticeCard
        targetText={speakingPractice.targetText}
        transcript={transcript}
        isListening={isListening}
        isSpeaking={isSpeaking}
        onPlayTarget={handlePlayPress}
        onRecordPress={handleRecordPress}
        onRetry={handleRetry}
        missingWords={feedback?.missingWords}
        extraWords={feedback?.extraWords}
        isComplete={feedback?.isComplete}
      />
      {attemptFailed ? (
        <Text
          className="mx-4 mb-3 text-caption text-danger"
          testID="speaking-practice-attempt-error"
        >
          {t('session.speakingPractice.attemptError')}
        </Text>
      ) : null}
    </>
  );
}
