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
  previous: () => void;
  skip: () => void;
}

// [WI-904] The gaps between chunks/sentences (writing time) were too short:
// learners reported the default 'normal' pace felt rushed. The pauses are
// lengthened by one notch — the old 'slow' pause budget is now 'normal' — while
// the articulation `rate` is left unchanged (the words are NOT drawn out, only
// the silence between them grows). `chunkPausePerWord` is multiplied by the
// chunk's word count to size the writing pause.
const PACE_CONFIG: Record<
  DictationPace,
  { rate: number; chunkPausePerWord: number; sentencePause: number }
> = {
  slow: { rate: 0.5, chunkPausePerWord: 4000, sentencePause: 5500 },
  normal: { rate: 0.6, chunkPausePerWord: 3000, sentencePause: 4000 },
  fast: { rate: 0.75, chunkPausePerWord: 2000, sentencePause: 3000 },
};

// 3-second countdown before first sentence
const COUNTDOWN_MS = 3500;

/**
 * Fallback: split text into chunks of approximately `size` words.
 * Short sentences (≤4 words) are never split — they come as one chunk.
 */
export function splitIntoChunks(text: string, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [text];
  // Short sentences stay whole (up to 4 real words, period doesn't count as a word)
  if (words.length <= 4) return [text];
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
    const sentence = configRef.current.sentences[sentenceIndex];
    if (!sentence) return [];

    // Prefer LLM-generated natural chunks when available
    const preComputed = configRef.current.punctuationReadAloud
      ? sentence.chunksWithPunctuation
      : sentence.chunks;
    if (preComputed && preComputed.length > 0) return preComputed;

    // Fallback to mechanical splitting for older data without chunks
    const text = getSentenceText(sentenceIndex);
    const size = configRef.current.chunkSize ?? 3;
    return splitIntoChunks(text, size);
  };

  // [BUG-166] Recursive playback driver — see speakChunkRef wiring below for
  // why this lives in a ref rather than a useCallback with an explicit deps
  // array. The function reads all mutable config (pace, language, sentences,
  // punctuation, chunkSize) via `configRef.current` so a config change
  // mid-playback is picked up on the next chunk boundary without needing to
  // remount or restart playback.
  const speakChunkRef = useRef<
    (sentenceIndex: number, chunkIndex: number) => void
  >(() => {
    /* placeholder — replaced by the real implementation on first render */
  });

  speakChunkRef.current = (sentenceIndex: number, chunkIndex: number) => {
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
            speakChunkRef.current(nextSentenceIndex, 0);
          };
          nextActionRef.current = action;
          pauseTimerRef.current = setTimeout(action, paceConfig.sentencePause);
        } else {
          // Chunk boundary — writing pause proportional to chunk word count
          const chunkWordCount = (chunks[chunkIndex] ?? '')
            .split(/\s+/)
            .filter(Boolean).length;
          const chunkPause = chunkWordCount * paceConfig.chunkPausePerWord;
          const nextChunkIndex = chunkIndex + 1;
          const action = () => {
            speakChunkRef.current(sentenceIndex, nextChunkIndex);
          };
          nextActionRef.current = action;
          pauseTimerRef.current = setTimeout(action, chunkPause);
        }
      },
      // H6: Reset state on TTS failure so playback never stays frozen in 'speaking'.
      // onStopped fires when Speech.stop() is called externally (pause/skip),
      // which is already handled by the pause/skip callbacks, so no extra reset needed there.
      onError: () => {
        if (stateRef.current !== 'paused') {
          setState('idle');
        }
      },
    });
  };

  // Stable wrapper so the public controls (start/pause/repeat/skip) can
  // depend on a referentially-equal function across renders without
  // triggering the react-hooks/exhaustive-deps suppression we removed.
  // The ref always points at the latest implementation, which always reads
  // the latest config via configRef.
  const speakChunk = useCallback(
    (sentenceIndex: number, chunkIndex: number) => {
      speakChunkRef.current(sentenceIndex, chunkIndex);
    },
    [],
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

  // [WI-903] Go back to the previous sentence and restart it from its first
  // chunk. Mirrors skip() in reverse. Clamps at index 0 — calling previous on
  // the first sentence restarts that sentence rather than going negative.
  const previous = useCallback(() => {
    clearPauseTimer();
    Speech.stop();
    const prevIndex = Math.max(0, indexRef.current - 1);
    setCurrentIndex(prevIndex);
    chunkIndexRef.current = 0;
    speakChunk(prevIndex, 0);
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
    previous,
    skip,
  };
}
