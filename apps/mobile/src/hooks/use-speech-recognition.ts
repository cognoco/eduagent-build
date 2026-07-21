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
  /**
   * Whether `transcript` is the engine's final result for the utterance
   * (`isFinal` on the native result event) rather than an interim guess.
   * Interim results keep arriving while the learner speaks and are safe to
   * display, but a consumer that commits text somewhere durable must wait for
   * this: stopping does not finalise, the true final arrives afterwards, and
   * committing the last interim inserts the half-heard phrase instead.
   */
  isFinalTranscript: boolean;
  error: string | null;
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  clearTranscript: () => void;
  /**
   * Prompt the user for microphone permission without starting the listener.
   * Intended for explicit, user-initiated inline permission recovery;
   * `startListening` owns the normal permission-and-recording flow.
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
    eventName: 'result' | 'error' | 'end',
    listener: (event: unknown) => void,
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
  maybeLoadModule?: SpeechRecognitionModuleLoader,
): UseSpeechRecognitionResult {
  const options =
    typeof optionsOrLoadModule === 'function' ? undefined : optionsOrLoadModule;
  const loadModule =
    typeof optionsOrLoadModule === 'function'
      ? optionsOrLoadModule
      : (maybeLoadModule ?? loadSpeechModule);
  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [isFinalTranscript, setIsFinalTranscript] = useState(false);
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
    let endSubscription: { remove: () => void } | undefined;

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
          isFinal?: boolean;
        };
        if (!Array.isArray(resultEvent.results)) {
          console.warn('[SpeechRecognition] Malformed result event:', event);
          return;
        }
        // results[] is the N-best alternatives for the current utterance, ordered
        // by confidence — not a sequence of utterances. Joining them concatenates
        // the same speech multiple times (e.g. "...close to equator ...close to
        // equator ...close to a Quaker"). Take the top alternative only.
        const nextTranscript = resultEvent.results[0]?.transcript?.trim() ?? '';

        if (!nextTranscript) {
          console.warn('[SpeechRecognition] Empty transcript event:', event);
          return;
        }
        const isFinal = resultEvent.isFinal === true;
        setTranscript(nextTranscript);
        setIsFinalTranscript(isFinal);
        setError(null);
        // The engine finalised the utterance: the capture is over even if the
        // learner never pressed stop, and even if stop already moved us to
        // processing while waiting for exactly this.
        if (isFinal) setStatus('idle');
      });

      // Terminal cleanup: the session ended without a final result (no speech,
      // engine gave up). Without this, a stop would sit in processing forever.
      endSubscription = speechModule.addListener('end', () => {
        if (!mountedRef.current) return;
        setStatus((current) => (current === 'error' ? current : 'idle'));
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
      endSubscription?.remove();
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

      if (!mountedRef.current) return;
      setTranscript('');
      setIsFinalTranscript(false);
      setStatus('listening');
      speechModule.start({
        lang: options?.lang ?? 'en-US',
        interimResults: true,
        continuous: true,
      });
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error ? err.message : 'Speech recognition failed',
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
        // Stopping does not finalise: the engine still owes us the final
        // result, which arrives after this call. Sitting in processing until
        // the result or end event lands is what keeps a consumer from
        // committing the last interim guess. (Any state but error, which is
        // terminal and must not be masked.) With no module there is no engine
        // to owe us anything and no end event will ever arrive, so waiting
        // would strand the caller in processing forever — settle immediately.
        const settled = speechModule ? 'processing' : 'idle';
        setStatus((current) => (current === 'error' ? current : settled));
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
    setIsFinalTranscript(false);
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
        // Swallow errors: inline permission recovery is best-effort. The
        // existing STT error remains surfaced, and a later startListening
        // attempt will report a permission failure if access is still missing.
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
    isFinalTranscript,
    error,
    isListening: status === 'listening',
    startListening,
    stopListening,
    clearTranscript,
    requestMicrophonePermission,
    getMicrophonePermissionStatus,
  };
}
