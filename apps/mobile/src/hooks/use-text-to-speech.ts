// ---------------------------------------------------------------------------
// TTS Hook — expo-speech wrapper for AI voice output (FR144-145)
// Option A: waits for complete response before TTS playback
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef, useEffect } from 'react';
import * as Speech from 'expo-speech';

export interface UseTextToSpeechResult {
  isSpeaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
}

/**
 * Hook wrapping expo-speech for TTS playback.
 * Follows Option A (wait for complete response before speaking).
 * Cleans up on unmount.
 */
export function useTextToSpeech(): UseTextToSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const mountedRef = useRef(true);

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

    Speech.speak(text, {
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

  return { isSpeaking, speak, stop };
}
