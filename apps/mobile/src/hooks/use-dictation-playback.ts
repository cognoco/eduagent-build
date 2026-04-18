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
  /** Words per spoken chunk. Young children get 2-3, older learners 4-5. Defaults to 3. */
  chunkSize?: number;
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
  { rate: number; chunkPausePerWord: number; sentencePause: number }
> = {
  slow: { rate: 0.5, chunkPausePerWord: 3000, sentencePause: 4000 },
  normal: { rate: 0.6, chunkPausePerWord: 2000, sentencePause: 3000 },
  fast: { rate: 0.75, chunkPausePerWord: 1200, sentencePause: 2000 },
};

// 3-second countdown before first sentence
const COUNTDOWN_MS = 3500;

/** Split text into chunks of approximately `size` words. */
export function splitIntoChunks(text: string, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(' '));
  }
  return chunks;
}

export function useDictationPlayback(config: PlaybackConfig): PlaybackControls {
  const [state, setState] = useState<PlaybackState>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  const chunkIndexRef = useRef(0);

  // RF-02: All runtime reads of pace, punctuationReadAloud, sentences, and
  // chunkSize go through configRef.current to prevent stale closure bugs when
  // config changes mid-playback.
  const configRef = useRef(config);
  configRef.current = config;

  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preStateRef = useRef<PlaybackState>('idle');
  const nextActionRef = useRef<() => void>(() => {
    return;
  });

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const getSentenceText = (index: number): string => {
    const sentence = configRef.current.sentences[index];
    if (!sentence) return '';
    return configRef.current.punctuationReadAloud
      ? sentence.withPunctuation
      : sentence.text;
  };

  const getChunksForSentence = (sentenceIndex: number): string[] => {
    const text = getSentenceText(sentenceIndex);
    const size = configRef.current.chunkSize ?? 3;
    return splitIntoChunks(text, size);
  };

  const speakChunk = useCallback(
    (sentenceIndex: number, chunkIndex: number) => {
      const chunks = getChunksForSentence(sentenceIndex);
      chunkIndexRef.current = chunkIndex;

      if (chunkIndex >= chunks.length || chunks.length === 0) {
        setState('complete');
        return;
      }

      setState('speaking');
      const { rate } = PACE_CONFIG[configRef.current.pace];

      Speech.speak(chunks[chunkIndex] ?? '', {
        language: configRef.current.language,
        rate,
        onDone: () => {
          if (stateRef.current === 'paused') return;

          // RF-02: Read pace config fresh — user may have changed pace mid-speech
          const paceConfig = PACE_CONFIG[configRef.current.pace];

          const isLastChunk = chunkIndex >= chunks.length - 1;
          const isLastSentence =
            sentenceIndex >= configRef.current.sentences.length - 1;

          if (isLastChunk && isLastSentence) {
            setState('complete');
            return;
          }

          setState('waiting');

          if (isLastChunk) {
            // Sentence boundary — longer pause, advance to next sentence
            const nextSentenceIndex = sentenceIndex + 1;
            const action = () => {
              setCurrentIndex(nextSentenceIndex);
              speakChunk(nextSentenceIndex, 0);
            };
            nextActionRef.current = action;
            pauseTimerRef.current = setTimeout(
              action,
              paceConfig.sentencePause
            );
          } else {
            // Chunk boundary — writing pause proportional to chunk word count
            const chunkWordCount = (chunks[chunkIndex] ?? '')
              .split(/\s+/)
              .filter(Boolean).length;
            const chunkPause = chunkWordCount * paceConfig.chunkPausePerWord;
            const nextChunkIndex = chunkIndex + 1;
            const action = () => {
              speakChunk(sentenceIndex, nextChunkIndex);
            };
            nextActionRef.current = action;
            pauseTimerRef.current = setTimeout(action, chunkPause);
          }
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const start = useCallback(() => {
    setState('countdown');
    setCurrentIndex(0);
    chunkIndexRef.current = 0;
    pauseTimerRef.current = setTimeout(() => {
      speakChunk(0, 0);
    }, COUNTDOWN_MS);
  }, [speakChunk]);

  const pause = useCallback(() => {
    preStateRef.current = stateRef.current;
    setState('paused');
    clearPauseTimer();
    Speech.stop();
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    const prev = preStateRef.current;
    if (prev === 'speaking') {
      // Re-speak the current chunk
      speakChunk(indexRef.current, chunkIndexRef.current);
    } else if (prev === 'waiting') {
      // Child pressed resume — speak the next chunk/sentence immediately
      nextActionRef.current();
    } else if (prev === 'countdown') {
      speakChunk(indexRef.current, chunkIndexRef.current);
    } else {
      setState(prev);
    }
  }, [speakChunk]);

  const repeat = useCallback(() => {
    clearPauseTimer();
    Speech.stop();
    speakChunk(indexRef.current, chunkIndexRef.current);
  }, [speakChunk, clearPauseTimer]);

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
    chunkIndexRef.current = 0;
    speakChunk(nextIndex, 0);
  }, [speakChunk, clearPauseTimer]);

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
