// ---------------------------------------------------------------------------
// STT Hook — expo-speech-recognition wrapper for voice input (FR138-143)
// Manual start/stop (no VAD) — learner taps to begin and end recording
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef, useEffect } from 'react';

/** STT lifecycle states */
export type SpeechRecognitionStatus =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'processing'
  | 'error';

export interface UseSpeechRecognitionResult {
  status: SpeechRecognitionStatus;
  transcript: string;
  error: string | null;
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  clearTranscript: () => void;
}

/**
 * Lazily resolve `ExpoSpeechRecognitionModule` from the dynamic import.
 * Returns `null` if the package is not installed / fails to load.
 */
async function loadSpeechModule(): Promise<{
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (opts: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
  }) => void;
  stop: () => void;
} | null> {
  try {
    const mod = await import('expo-speech-recognition');
    return mod.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

/**
 * Hook wrapping expo-speech-recognition for on-device STT.
 * Uses manual start/stop (no VAD per plan — VAD is stretch goal).
 *
 * Note: expo-speech-recognition requires the package to be installed.
 * If unavailable, all functions gracefully degrade (error state).
 */
export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setStatus('requesting_permission');

      const speechModule = await loadSpeechModule();

      if (!speechModule) {
        if (mountedRef.current) {
          setError('Speech recognition is not available on this device');
          setStatus('error');
        }
        return;
      }

      // Request permissions
      const { granted } = await speechModule.requestPermissionsAsync();
      if (!granted) {
        if (mountedRef.current) {
          setError('Microphone permission is required for voice input');
          setStatus('error');
        }
        return;
      }

      if (mountedRef.current) {
        setTranscript('');
        setStatus('listening');
      }

      // Start recognition — event listeners are handled via useSpeechRecognitionEvent
      // at the component level (VoiceRecordButton / ChatShell). This hook only
      // manages the imperative start/stop lifecycle.
      speechModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
      });
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error ? err.message : 'Speech recognition failed'
        );
        setStatus('error');
      }
    }
  }, []);

  const stopListening = useCallback(async () => {
    try {
      const speechModule = await loadSpeechModule();

      if (speechModule) {
        speechModule.stop();
      }

      if (mountedRef.current) {
        setStatus('idle');
      }
    } catch {
      if (mountedRef.current) {
        setStatus('idle');
      }
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
    setStatus('idle');
  }, []);

  return {
    status,
    transcript,
    error,
    isListening: status === 'listening',
    startListening,
    stopListening,
    clearTranscript,
  };
}
