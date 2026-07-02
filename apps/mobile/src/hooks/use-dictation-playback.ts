import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import type {
  AgeBracket,
  DictationPace,
  DictationSentence,
} from '@eduagent/schemas';

export type PlaybackState =
  | 'idle'
  | 'countdown'
  | 'speaking'
  | 'waiting'
  | 'paused'
  | 'unavailable'
  | 'complete';

export type VoiceAvailabilityState =
  | 'unknown'
  | 'checking'
  | 'available'
  | 'unavailable';

export interface PlaybackConfig {
  sentences: DictationSentence[];
  pace: DictationPace;
  punctuationReadAloud: boolean;
  language: string;
  /** Words per spoken chunk. Young children get 2-3, older learners 4-5. Defaults to 3. */
  chunkSize?: number;
  /** Learner age bracket. Defaults to `adult` when omitted. */
  ageBracket?: AgeBracket;
}

export interface PlaybackControls {
  state: PlaybackState;
  currentIndex: number;
  totalSentences: number;
  voiceAvailability: VoiceAvailabilityState;
  voiceLanguage: string;
  start: () => void;
  pause: () => void;
  resume: () => void;
  repeat: () => void;
  previous: () => void;
  skip: () => void;
}

type VoiceAvailabilityResult = boolean | Promise<boolean>;

// Natural clear-speech pacing:
// - `rate` controls articulation. Keep it near normal so words do not sound
//   stretched or robotic.
// - `phrasePause` is the short audible boundary between chunks.
// - `sentencePause` is the larger response window after a complete sentence.
const PACE_CONFIG: Record<
  DictationPace,
  { rate: number; phrasePause: number; sentencePause: number }
> = {
  slow: { rate: 0.9, phrasePause: 700, sentencePause: 1400 },
  normal: { rate: 1.0, phrasePause: 600, sentencePause: 1200 },
  fast: { rate: 1.0, phrasePause: 400, sentencePause: 800 },
};

// Younger learners get more response time after complete sentence boundaries.
// Phrase pauses stay short; age/profile support primarily comes from chunking
// and sentence/item windows, not long silence after every spoken phrase.
const AGE_PAUSE_MULTIPLIER: Record<AgeBracket, number> = {
  child: 1.45,
  adolescent: 1.15,
  adult: 1.0,
};

export function computeChunkPauseMs(
  chunkText: string,
  pace: DictationPace,
  _ageBracket: AgeBracket,
): number {
  const words = chunkText.split(/\s+/).filter(Boolean);
  return words.length === 0 ? 0 : PACE_CONFIG[pace].phrasePause;
}

export function computeSentencePauseMs(
  pace: DictationPace,
  ageBracket: AgeBracket,
): number {
  return Math.round(
    PACE_CONFIG[pace].sentencePause * AGE_PAUSE_MULTIPLIER[ageBracket],
  );
}

// 3-second countdown before first sentence
const COUNTDOWN_MS = 3500;

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  cs: 'Czech',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  nb: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
};

function normalizeLanguageTag(language: string): string {
  return language.trim().toLowerCase().replace(/_/g, '-');
}

// [WI-1149] Some Android TTS engines report a voice's language as a 3-letter
// ISO 639-2/3 code (e.g. "eng", "deu") rather than the ISO 639-1 base ("en",
// "de") the rest of the app uses. Map the codes for our conversation-language
// set back to their 2-letter base so a device that reports "eng" still matches
// a target of "en". Unmapped codes fall through unchanged. Note: "nor" is the
// generic ISO 639-2 Norwegian code and is mapped to Bokmål ("nb") — the app's
// Norwegian; Nynorsk is "nno"/"nn" and is not in the conversation set, so it is
// deliberately not mapped here.
const ISO_639_2_TO_1: Record<string, string> = {
  ces: 'cs',
  cze: 'cs',
  deu: 'de',
  ger: 'de',
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  fre: 'fr',
  ita: 'it',
  jpn: 'ja',
  nor: 'nb',
  nob: 'nb',
  pol: 'pl',
  por: 'pt',
};

function getBaseLanguage(language: string): string {
  const base = normalizeLanguageTag(language).split('-')[0] ?? '';
  return ISO_639_2_TO_1[base] ?? base;
}

function voiceMatchesLanguage(
  voiceLanguage: string,
  targetLanguage: string,
): boolean {
  const voice = normalizeLanguageTag(voiceLanguage);
  const target = normalizeLanguageTag(targetLanguage);
  if (!voice || !target) return false;
  return (
    voice === target ||
    voice.startsWith(`${target}-`) ||
    target.startsWith(`${voice}-`) ||
    getBaseLanguage(voice) === getBaseLanguage(target)
  );
}

export function getDictationVoiceLanguageName(language: string): string {
  const base = getBaseLanguage(language);
  return LANGUAGE_DISPLAY_NAMES[base] ?? language;
}

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
  const [voiceAvailability, setVoiceAvailability] =
    useState<VoiceAvailabilityState>('unknown');

  const stateRef = useRef(state);
  stateRef.current = state;

  const voiceAvailabilityRef = useRef(voiceAvailability);
  voiceAvailabilityRef.current = voiceAvailability;

  const checkedVoiceLanguageRef = useRef<string | null>(null);

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

  const setVoiceAvailabilityState = useCallback(
    (next: VoiceAvailabilityState) => {
      voiceAvailabilityRef.current = next;
      setVoiceAvailability(next);
    },
    [],
  );

  const ensureVoiceAvailable = useCallback((): VoiceAvailabilityResult => {
    const targetLanguage = normalizeLanguageTag(configRef.current.language);
    if (!targetLanguage) {
      setVoiceAvailabilityState('available');
      checkedVoiceLanguageRef.current = targetLanguage;
      return true;
    }

    if (
      voiceAvailabilityRef.current === 'available' &&
      checkedVoiceLanguageRef.current === targetLanguage
    ) {
      return true;
    }

    setVoiceAvailabilityState('checking');

    return (async () => {
      let voices: Speech.Voice[] = [];
      let enumerationFailed = false;
      try {
        voices = await Speech.getAvailableVoicesAsync();
      } catch {
        voices = [];
        enumerationFailed = true;
      }

      checkedVoiceLanguageRef.current = targetLanguage;

      // [WI-1149] Graceful degradation. Many Android TTS engines return an
      // empty voice list (or throw) even when the system voice speaks fine —
      // the engine simply doesn't enumerate voices across the JS bridge.
      // WI-908's gate wrongly read that as "no voice" and blocked playback
      // that would have succeeded. When we cannot enumerate ANY voices, assume
      // the device's default TTS can speak the language and let Speech.speak()
      // attempt it; the speakChunk `onError` path already resets state if it
      // genuinely cannot. A genuine "voices exist but none match the target
      // language" case (non-empty list) still falls through to `unavailable`.
      if (enumerationFailed || voices.length === 0) {
        setVoiceAvailabilityState('available');
        return true;
      }

      const hasMatchingVoice = voices.some((voice) =>
        voiceMatchesLanguage(voice.language, targetLanguage),
      );

      if (hasMatchingVoice) {
        setVoiceAvailabilityState('available');
        return true;
      }

      setVoiceAvailabilityState('unavailable');
      setState('unavailable');
      return false;
    })();
  }, [setVoiceAvailabilityState]);

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
    const speakAfterVoiceCheck = () => {
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

          const isLastChunk = chunkIndex >= chunks.length - 1;
          const isLastSentence =
            sentenceIndex >= configRef.current.sentences.length - 1;

          if (isLastChunk && isLastSentence) {
            setState('complete');
            return;
          }

          setState('waiting');

          // RF-02: Read pace + age fresh so a mid-playback config change is
          // picked up on the next chunk boundary.
          const pace = configRef.current.pace;
          const ageBracket = configRef.current.ageBracket ?? 'adult';

          if (isLastChunk) {
            // Sentence boundary — longer pause, advance to next sentence
            const nextSentenceIndex = sentenceIndex + 1;
            const action = () => {
              setCurrentIndex(nextSentenceIndex);
              speakChunkRef.current(nextSentenceIndex, 0);
            };
            nextActionRef.current = action;
            pauseTimerRef.current = setTimeout(
              action,
              computeSentencePauseMs(pace, ageBracket),
            );
          } else {
            // Chunk boundary: short phrase pause, not writing-time silence.
            const chunkPause = computeChunkPauseMs(
              chunks[chunkIndex] ?? '',
              pace,
              ageBracket,
            );
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

    const voiceAvailable = ensureVoiceAvailable();
    if (voiceAvailable === true) {
      speakAfterVoiceCheck();
      return;
    }
    if (voiceAvailable === false) return;

    void voiceAvailable.then((available) => {
      if (available) speakAfterVoiceCheck();
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
    clearPauseTimer();
    setCurrentIndex(0);
    chunkIndexRef.current = 0;
    // [WI-1149] Force a fresh voice check on each user-initiated play. The
    // graceful-degradation path caches `available` when the engine couldn't
    // enumerate voices yet; clearing the cache key here ensures a later play
    // re-checks (the engine may have since bound and can now report a genuine
    // no-match) rather than reusing the optimistic result. The per-chunk cache
    // within a single playback session is unaffected — it is re-seeded below.
    checkedVoiceLanguageRef.current = null;
    const beginCountdown = () => {
      setState('countdown');
      pauseTimerRef.current = setTimeout(() => {
        speakChunk(0, 0);
      }, COUNTDOWN_MS);
    };

    const voiceAvailable = ensureVoiceAvailable();
    if (voiceAvailable === true) {
      beginCountdown();
      return;
    }
    if (voiceAvailable === false) return;

    void voiceAvailable.then((available) => {
      if (available) beginCountdown();
    });
  }, [speakChunk, clearPauseTimer, ensureVoiceAvailable]);

  const pause = useCallback(() => {
    if (stateRef.current === 'unavailable') return;
    preStateRef.current = stateRef.current;
    setState('paused');
    clearPauseTimer();
    Speech.stop();
  }, [clearPauseTimer]);

  const resume = useCallback(() => {
    if (stateRef.current === 'unavailable') return;
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
    if (stateRef.current === 'unavailable') return;
    clearPauseTimer();
    Speech.stop();
    speakChunk(indexRef.current, chunkIndexRef.current);
  }, [speakChunk, clearPauseTimer]);

  const skip = useCallback(() => {
    if (stateRef.current === 'unavailable') return;
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
    if (stateRef.current === 'unavailable') return;
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
    voiceAvailability,
    voiceLanguage: config.language,
    start,
    pause,
    resume,
    repeat,
    previous,
    skip,
  };
}
