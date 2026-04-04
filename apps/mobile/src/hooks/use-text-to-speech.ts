// ---------------------------------------------------------------------------
// TTS Hook — expo-speech wrapper for AI voice output (FR144-145, FR147)
// Option A: waits for complete response before TTS playback
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef, useEffect } from 'react';
import * as Speech from 'expo-speech';

export interface UseTextToSpeechResult {
  isSpeaking: boolean;
  isPaused: boolean;
  rate: number;
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  setRate: (rate: number) => void;
}

interface UseTextToSpeechOptions {
  language?: string;
}

/**
 * Hook wrapping expo-speech for TTS playback.
 * Follows Option A (wait for complete response before speaking).
 * Supports pause/resume (FR147).
 * Cleans up on unmount.
 *
 * TODO (Epic 8 — Story 8.4): VoiceOver/TalkBack coexistence spike.
 * When a screen reader is active, app TTS competes for the audio channel.
 * Three documented approaches: (1) defer to screen reader, (2) audio ducking,
 * (3) manual play button. Requires physical device testing. See FR149.
 */
export function useTextToSpeech(
  options?: UseTextToSpeechOptions
): UseTextToSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRateState] = useState(1.0);
  const mountedRef = useRef(true);
  const rateRef = useRef(1.0);
  const lastTextRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Speech.stop();
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      // Stop any ongoing speech first
      Speech.stop();

      lastTextRef.current = text;
      setIsPaused(false);

      Speech.speak(text, {
        rate: rateRef.current,
        language: options?.language,
        onStart: () => {
          if (mountedRef.current) setIsSpeaking(true);
        },
        onDone: () => {
          if (mountedRef.current) {
            setIsSpeaking(false);
            setIsPaused(false);
          }
        },
        onStopped: () => {
          if (mountedRef.current) {
            setIsSpeaking(false);
            setIsPaused(false);
          }
        },
        onError: () => {
          if (mountedRef.current) {
            setIsSpeaking(false);
            setIsPaused(false);
          }
        },
      });
    },
    [options?.language]
  );

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    Speech.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    Speech.resume();
    setIsPaused(false);
  }, []);

  const replay = useCallback(() => {
    if (lastTextRef.current) {
      speak(lastTextRef.current);
    }
  }, [speak]);

  const setRate = useCallback((newRate: number) => {
    rateRef.current = newRate;
    setRateState(newRate);
  }, []);

  return {
    isSpeaking,
    isPaused,
    rate,
    speak,
    stop,
    pause,
    resume,
    replay,
    setRate,
  };
}
