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
  /**
   * Prompt the user for microphone permission without starting the listener.
   * Safe to call on mount — the OS will only show a dialog the first time;
   * subsequent calls return the cached grant silently.
   * Returns `true` if granted (or already granted), `false` otherwise.
   */
  requestMicrophonePermission: () => Promise<boolean>;
  /**
   * Read the current microphone permission state without prompting.
   * Returns `null` when the speech module is unavailable.
   */
  getMicrophonePermissionStatus: () => Promise<{
    granted: boolean;
    canAskAgain: boolean;
  } | null>;
}

type SpeechRecognitionModule = {
  getPermissionsAsync: () => Promise<{
    granted: boolean;
    canAskAgain: boolean;
  }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (opts: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
  }) => void;
  stop: () => void;
  addListener?: (
    eventName: 'result' | 'error',
    listener: (event: unknown) => void
  ) => { remove: () => void };
};

type SpeechRecognitionModuleLoader =
  () => Promise<SpeechRecognitionModule | null>;

interface UseSpeechRecognitionOptions {
  lang?: string;
}

/**
 * Lazily resolve `ExpoSpeechRecognitionModule` from the dynamic import.
 * Returns `null` if the package is not installed / fails to load.
 */
async function loadSpeechModule(): Promise<SpeechRecognitionModule | null> {
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
export function useSpeechRecognition(
  optionsOrLoadModule?:
    | UseSpeechRecognitionOptions
    | SpeechRecognitionModuleLoader,
  maybeLoadModule?: SpeechRecognitionModuleLoader
): UseSpeechRecognitionResult {
  const options =
    typeof optionsOrLoadModule === 'function' ? undefined : optionsOrLoadModule;
  const loadModule =
    typeof optionsOrLoadModule === 'function'
      ? optionsOrLoadModule
      : maybeLoadModule ?? loadSpeechModule;
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

  useEffect(() => {
    let cancelled = false;
    let resultSubscription: { remove: () => void } | undefined;
    let errorSubscription: { remove: () => void } | undefined;

    void (async () => {
      const speechModule = await loadModule();
      if (
        cancelled ||
        !speechModule ||
        typeof speechModule.addListener !== 'function'
      ) {
        return;
      }

      resultSubscription = speechModule.addListener('result', (event) => {
        if (!mountedRef.current) return;

        const resultEvent = event as {
          results?: Array<{ transcript?: string }>;
        };
        if (!Array.isArray(resultEvent.results)) {
          console.warn('[SpeechRecognition] Malformed result event:', event);
          return;
        }
        const nextTranscript = (resultEvent.results ?? [])
          .map((result) => result.transcript?.trim() ?? '')
          .filter(Boolean)
          .join(' ')
          .trim();

        if (!nextTranscript) {
          console.warn('[SpeechRecognition] Empty transcript event:', event);
          return;
        }
        setTranscript(nextTranscript);
        setError(null);
      });

      errorSubscription = speechModule.addListener('error', (event) => {
        if (!mountedRef.current) return;

        const errorEvent = event as { message?: string };
        setError(errorEvent.message ?? 'Speech recognition failed');
        setStatus('error');
      });
    })();

    return () => {
      cancelled = true;
      resultSubscription?.remove();
      errorSubscription?.remove();
    };
  }, [loadModule]);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setStatus('requesting_permission');

      const speechModule = await loadModule();

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
      speechModule.start({
        lang: options?.lang ?? 'en-US',
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
  }, [loadModule, options?.lang]);

  const stopListening = useCallback(async () => {
    try {
      const speechModule = await loadModule();

      if (speechModule) {
        speechModule.stop();
      }

      if (mountedRef.current) {
        setStatus('idle');
      }
    } catch (err) {
      console.warn('[Speech] Stop listening failed:', err);
      if (mountedRef.current) {
        setStatus('idle');
      }
    }
  }, [loadModule]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
    setStatus('idle');
  }, []);

  const requestMicrophonePermission =
    useCallback(async (): Promise<boolean> => {
      try {
        const speechModule = await loadModule();
        if (!speechModule) return false;
        const { granted } = await speechModule.requestPermissionsAsync();
        return granted;
      } catch {
        // Swallow errors: this is a best-effort pre-warm. The button-press path
        // will surface a user-facing error if permission is still missing later.
        return false;
      }
    }, [loadModule]);

  const getMicrophonePermissionStatus = useCallback(async () => {
    try {
      const speechModule = await loadModule();
      if (!speechModule) return null;
      return await speechModule.getPermissionsAsync();
    } catch {
      return null;
    }
  }, [loadModule]);

  return {
    status,
    transcript,
    error,
    isListening: status === 'listening',
    startListening,
    stopListening,
    clearTranscript,
    requestMicrophonePermission,
    getMicrophonePermissionStatus,
  };
}
