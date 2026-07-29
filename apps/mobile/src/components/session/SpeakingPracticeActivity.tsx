import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
    isFinalTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useSpeechRecognition({ lang: speakingPractice?.locale });
  const recordAttempt = useRecordSpeakingPracticeAttempt();
  const [feedback, setFeedback] = useState<AttemptFeedback | null>(null);
  const [attemptFailed, setAttemptFailed] = useState(false);
  const wasListeningRef = useRef(false);
  const hasSubmittedCycleRef = useRef(false);
  const discardListeningCycleRef = useRef(false);
  const attemptGenerationRef = useRef(0);
  const { t } = useTranslation();

  // Only the request belonging to the current recording/session generation
  // may update feedback. Layout cleanup is intentionally commit-synchronous:
  // changing session context or unmounting must invalidate in-flight requests
  // before a promise continuation can settle into stale UI.
  useLayoutEffect(() => {
    attemptGenerationRef.current += 1;
    discardListeningCycleRef.current = true;
    wasListeningRef.current = false;
    hasSubmittedCycleRef.current = false;
    setFeedback(null);
    setAttemptFailed(false);

    return () => {
      attemptGenerationRef.current += 1;
    };
  }, [
    sessionId,
    subjectId,
    speakingPractice?.targetText,
    speakingPractice?.locale,
  ]);

  // Stop-listening and final-transcript-ready are distinct signals: the STT
  // hook can flip `isListening` false (the engine enters `processing`) well
  // before its real final result lands, so gating on `isListening` alone
  // submits the last interim guess instead of the true final. Submission
  // waits for `isFinalTranscript`, and then uses whatever `transcript` holds
  // at that moment — a late final arriving after the mic already stopped
  // replaces the interim text that was showing. `hasSubmittedCycleRef` bounds
  // this to at most once per recording cycle; a cycle that ends without ever
  // producing a final (cancelled, or an `error` status) simply never submits.
  useEffect(() => {
    if (discardListeningCycleRef.current) {
      if (!isListening) discardListeningCycleRef.current = false;
      wasListeningRef.current = false;
      hasSubmittedCycleRef.current = false;
      return;
    }

    if (isListening) {
      wasListeningRef.current = true;
      hasSubmittedCycleRef.current = false;
      return;
    }

    if (!wasListeningRef.current || hasSubmittedCycleRef.current) return;
    if (!isFinalTranscript) return;

    wasListeningRef.current = false;
    hasSubmittedCycleRef.current = true;

    const trimmed = transcript.trim();
    if (trimmed && speakingPractice) {
      const attemptGeneration = ++attemptGenerationRef.current;
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
          if (attemptGeneration !== attemptGenerationRef.current) return;
          setFeedback({
            missingWords: result.missingWords,
            extraWords: result.extraWords,
            isComplete: result.isComplete,
          });
        } catch {
          if (attemptGeneration !== attemptGenerationRef.current) return;
          setAttemptFailed(true);
        }
      })();
    }
  }, [
    isListening,
    isFinalTranscript,
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
    attemptGenerationRef.current += 1;
    discardListeningCycleRef.current = false;
    setFeedback(null);
    setAttemptFailed(false);
    void startListening();
  }, [isListening, startListening, stopListening]);

  const handleRetry = useCallback(() => {
    // Target text is a prop derived from `activity`, never local state — no
    // code path here can lose it. Only the transcript/feedback reset.
    attemptGenerationRef.current += 1;
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
