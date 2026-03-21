// ---------------------------------------------------------------------------
// TTS Hook — expo-speech wrapper for AI voice output (FR144-145)
// Option A: waits for complete response before TTS playback
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef, useEffect } from 'react';
import * as Speech from 'expo-speech';

export interface UseTextToSpeechResult {
  isSpeaking: boolean;
  rate: number;
  speak: (text: string) => void;
  stop: () => void;
  replay: () => void;
  setRate: (rate: number) => void;
}

/**
 * Hook wrapping expo-speech for TTS playback.
 * Follows Option A (wait for complete response before speaking).
 * Cleans up on unmount.
 */
export function useTextToSpeech(): UseTextToSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
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

  const speak = useCallback((text: string) => {
    // Stop any ongoing speech first
    Speech.stop();

    lastTextRef.current = text;

    Speech.speak(text, {
      rate: rateRef.current,
      onStart: () => {
        if (mountedRef.current) setIsSpeaking(true);
      },
      onDone: () => {
        if (mountedRef.current) setIsSpeaking(false);
      },
      onStopped: () => {
        if (mountedRef.current) setIsSpeaking(false);
      },
      onError: () => {
        if (mountedRef.current) setIsSpeaking(false);
      },
    });
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
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

  return { isSpeaking, rate, speak, stop, replay, setRate };
}
