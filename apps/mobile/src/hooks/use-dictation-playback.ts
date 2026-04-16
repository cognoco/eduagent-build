import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import type { DictationPace, DictationSentence } from '@eduagent/schemas';

export type PlaybackState =
  | 'idle'
  | 'countdown'
  | 'speaking'
  | 'waiting'
  | 'paused'
  | 'complete';

export interface PlaybackConfig {
  sentences: DictationSentence[];
  pace: DictationPace;
  punctuationReadAloud: boolean;
  language: string;
}

export interface PlaybackControls {
  state: PlaybackState;
  currentIndex: number;
  totalSentences: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  repeat: () => void;
  skip: () => void;
}

const PACE_CONFIG: Record<
  DictationPace,
  { rate: number; basePause: number; perWordPause: number }
> = {
  slow: { rate: 0.5, basePause: 2000, perWordPause: 1500 },
  normal: { rate: 0.6, basePause: 1500, perWordPause: 1000 },
  fast: { rate: 0.75, basePause: 1000, perWordPause: 700 },
};

// 3-second countdown before first sentence
const COUNTDOWN_MS = 3500;

export function useDictationPlayback(config: PlaybackConfig): PlaybackControls {
  const [state, setState] = useState<PlaybackState>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  // RF-02: All runtime reads of pace, punctuationReadAloud, and sentences go
  // through configRef.current to prevent stale closure bugs when config changes
  // mid-playback (e.g. child changes pace during dictation).
  const configRef = useRef(config);
  configRef.current = config;

  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preStateRef = useRef<PlaybackState>('idle');

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  // Plain functions (not useCallback) that read from configRef.current — RF-02 fix.
  // This ensures pace/punctuation changes are picked up even inside onDone callbacks.
  const getSentenceText = (index: number): string => {
    const sentence = configRef.current.sentences[index];
    if (!sentence) return '';
    return configRef.current.punctuationReadAloud
      ? sentence.withPunctuation
      : sentence.text;
  };

  const getPauseDuration = (index: number): number => {
    const sentence = configRef.current.sentences[index];
    if (!sentence) return 0;
    const paceConfig = PACE_CONFIG[configRef.current.pace];
    return paceConfig.basePause + sentence.wordCount * paceConfig.perWordPause;
  };

  const speakSentence = useCallback(
    (index: number) => {
      const text = getSentenceText(index);
      if (!text) {
        setState('complete');
        return;
      }

      setState('speaking');
      const paceConfig = PACE_CONFIG[configRef.current.pace];

      Speech.speak(text, {
        language: configRef.current.language,
        rate: paceConfig.rate,
        onDone: () => {
          if (stateRef.current === 'paused') return;

          const isLast =
            indexRef.current >= configRef.current.sentences.length - 1;
          if (isLast) {
            setState('complete');
            return;
          }

          setState('waiting');
          const pauseMs = getPauseDuration(indexRef.current);
          pauseTimerRef.current = setTimeout(() => {
            const nextIndex = indexRef.current + 1;
            setCurrentIndex(nextIndex);
            speakSentence(nextIndex);
          }, pauseMs);
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const start = useCallback(() => {
    setState('countdown');
    setCurrentIndex(0);
    pauseTimerRef.current = setTimeout(() => {
      speakSentence(0);
    }, COUNTDOWN_MS);
  }, [speakSentence]);

  const pause = useCallback(() => {
    preStateRef.current = stateRef.current;
    setState('paused');
    clearPauseTimer();
    Speech.stop();
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    const prev = preStateRef.current;
    if (prev === 'speaking') {
      speakSentence(indexRef.current);
    } else if (prev === 'waiting') {
      // Resume from waiting — replay full pause duration on resume (simplified)
      setState('waiting');
      const pauseMs = getPauseDuration(indexRef.current);
      pauseTimerRef.current = setTimeout(() => {
        const nextIndex = indexRef.current + 1;
        setCurrentIndex(nextIndex);
        speakSentence(nextIndex);
      }, pauseMs);
    } else if (prev === 'countdown') {
      speakSentence(indexRef.current);
    } else {
      setState(prev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakSentence]);

  const repeat = useCallback(() => {
    clearPauseTimer();
    Speech.stop();
    speakSentence(indexRef.current);
  }, [speakSentence, clearPauseTimer]);

  const skip = useCallback(() => {
    clearPauseTimer();
    Speech.stop();
    const isLast = indexRef.current >= configRef.current.sentences.length - 1;
    if (isLast) {
      setState('complete');
      return;
    }
    const nextIndex = indexRef.current + 1;
    setCurrentIndex(nextIndex);
    speakSentence(nextIndex);
  }, [speakSentence, clearPauseTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPauseTimer();
      Speech.stop();
    };
  }, [clearPauseTimer]);

  return {
    state,
    currentIndex,
    totalSentences: config.sentences.length,
    start,
    pause,
    resume,
    repeat,
    skip,
  };
}
