import { useState, useCallback, useRef, useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl } from '../lib/api';
import { useProfile } from '../lib/profile';
import {
  countMeaningfulTokens,
  isLikelyHomework,
  splitHomeworkProblems,
} from '../components/homework/problem-cards';
import {
  trackHomeworkOcrGateAccepted,
  trackHomeworkOcrGateRejected,
  trackHomeworkOcrGateShortcircuit,
  type HomeworkOcrGateSource,
} from '../lib/analytics';

/**
 * Check whether the ML Kit native module is linked in this build.
 * Returns false for dev-client builds that predate the ML Kit dependency.
 */
function isTextRecognitionAvailable(): boolean {
  return NativeModules.TextRecognition != null;
}

export type OcrStatus = 'idle' | 'processing' | 'done' | 'error';

export interface UseHomeworkOcrResult {
  text: string | null;
  status: OcrStatus;
  error: string | null;
  failCount: number;
  process: (uri: string) => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => void;
}

type RecognizedTextResult = {
  text: string | null;
  confidence?: number;
};

export const NON_HOMEWORK_ERROR_MESSAGE =
  "We couldn't find a clear homework problem in this photo. Try again or type it in.";

async function copyToCache(tempUri: string): Promise<string> {
  const stableUri = `${FileSystem.cacheDirectory}homework-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: tempUri, to: stableUri });
  return stableUri;
}

async function resizeImage(uri: string): Promise<string> {
  const result = await manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    format: SaveFormat.JPEG,
    compress: 0.9,
  });
  return result.uri;
}

const OCR_DEVICE_TIMEOUT_MS = 20_000;
const OCR_SERVER_TIMEOUT_MS = 15_000;

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildGateMetrics(
  text: string,
  confidence?: number,
): {
  tokens: number;
  words: number;
  confidence?: number;
} {
  return {
    tokens: countMeaningfulTokens(text),
    words: getWordCount(text),
    ...(confidence == null ? {} : { confidence }),
  };
}

function hasHomeworkCue(text: string): boolean {
  if (/\d/.test(text) || /[+\-−×*·÷/=<>≤≥±²³]/.test(text)) {
    return true;
  }

  if (/^\s*(?:\d+|[A-Z])[.)]\s+/m.test(text)) {
    return true;
  }

  if (/[?!:]/.test(text)) {
    return true;
  }

  return /\b(?:answer|calculate|choose|circle|compare|complete|conjugate|contrast|correct|define|describe|draw|evaluate|explain|factor|fill|find|graph|how|identify|label|prove|read|select|show|simplify|solve|translate|underline|what|when|where|which|who|why|write)\b/iu.test(
    text,
  );
}

function shouldEscalateLocalOcr(text: string, confidence?: number): boolean {
  if (confidence != null && confidence < 0.75) {
    return true;
  }

  if (hasHomeworkCue(text)) {
    return false;
  }

  const words = getWordCount(text);
  const nonEmptyLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;

  return words > 0 && words <= 8 && nonEmptyLines <= 5;
}

function getLocalConfidence(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  const candidate = result as {
    confidence?: unknown;
    blocks?: Array<{ confidence?: unknown }>;
  };

  const blockConfidences =
    candidate.blocks
      ?.map((block) => normalizeConfidence(block?.confidence))
      .filter((value): value is number => value != null) ?? [];

  if (blockConfidences.length > 0) {
    return (
      blockConfidences.reduce((sum, value) => sum + value, 0) /
      blockConfidences.length
    );
  }

  return normalizeConfidence(candidate.confidence);
}

async function recognizeText(imageUri: string): Promise<RecognizedTextResult> {
  const resizedUri = await resizeImage(imageUri);
  const result = await Promise.race([
    TextRecognition.recognize(resizedUri),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('On-device text recognition timed out')),
        OCR_DEVICE_TIMEOUT_MS,
      ),
    ),
  ]);
  const text = result.text?.trim();
  return {
    text: text || null,
    confidence: getLocalConfidence(result),
  };
}

// [BUG-681 / I-16] Accept an optional external AbortSignal so a user-initiated
// cancel() actually aborts the server OCR fetch (previously only the internal
// timeout could abort). Both signals are wired into a single controller; the
// fetch aborts on whichever fires first.
async function recognizeTextServerSide(
  imageUri: string,
  token: string | null,
  profileId?: string,
  externalSignal?: AbortSignal,
): Promise<RecognizedTextResult> {
  const uploadUri = await resizeImage(imageUri);
  const formData = new FormData();
  formData.append('image', {
    uri: uploadUri,
    name: `homework-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (profileId) {
    headers['X-Profile-Id'] = profileId;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_SERVER_TIMEOUT_MS);
  // Forward an already-aborted external signal immediately, and listen for
  // future aborts. We do not remove the listener on completion — the
  // controller is short-lived (one fetch); the closure GCs with it.
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }
  }
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/v1/ocr`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response || !response.ok) {
    throw new Error(`Server OCR failed (${response?.status ?? 'unknown'})`);
  }

  const payload = (await response.json()) as {
    text?: string | null;
    confidence?: number | null;
  };
  const text = payload.text?.trim();
  return {
    text: text || null,
    confidence: normalizeConfidence(payload.confidence),
  };
}

export function useHomeworkOcr(): UseHomeworkOcrResult {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const currentUriRef = useRef<string | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  // [I-16] Guard state setters so recognizeText completing after unmount
  // (or after cancel()) doesn't call setState on an unmounted component.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRef.current?.abort();
      cancelRef.current = null;
    };
  }, []);

  const finishAsError = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setFailCount((prev) => prev + 1);
    setError(message);
    setStatus('error');
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current?.abort();
    cancelRef.current = null;
    if (!mountedRef.current) return;
    setStatus('idle');
    setError(null);
  }, []);

  const resolveSuccess = useCallback(
    (
      recognized: RecognizedTextResult,
      source: HomeworkOcrGateSource,
    ): boolean => {
      if (!recognized.text) {
        return false;
      }

      const metrics = buildGateMetrics(recognized.text, recognized.confidence);
      if (!isLikelyHomework(recognized.text, recognized.confidence)) {
        const droppedCount = splitHomeworkProblems(
          recognized.text,
          recognized.confidence,
        ).dropped;
        trackHomeworkOcrGateRejected({
          source,
          ...metrics,
          droppedCount,
        });
        return false;
      }

      setText(recognized.text);
      setError(null);
      setStatus('done');
      trackHomeworkOcrGateAccepted({ source, ...metrics });
      return true;
    },
    [],
  );

  const tryServerFallback = useCallback(
    async (
      uri: string,
      signal?: AbortSignal,
    ): Promise<RecognizedTextResult | null> => {
      try {
        const token = await getToken();
        return await recognizeTextServerSide(
          uri,
          token ?? null,
          activeProfile?.id,
          signal,
        );
      } catch (err) {
        // [BUG-681] Distinguish user-initiated cancel from a real failure so
        // we do not surface a "server failed" error after a deliberate cancel.
        if ((err as { name?: string } | null)?.name === 'AbortError') {
          return null;
        }
        console.error('[OCR] Server fallback failed:', err);
        return null;
      }
    },
    [activeProfile?.id, getToken],
  );

  const runOcr = useCallback(
    async (uri: string, isRetry: boolean) => {
      cancelRef.current?.abort();
      const controller = new AbortController();
      cancelRef.current = controller;

      setStatus('processing');
      setError(null);
      if (!isRetry) {
        setText(null);
        setFailCount(0);
      }

      if (controller.signal.aborted) {
        return;
      }

      if (!isTextRecognitionAvailable()) {
        console.error(
          '[OCR] ML Kit TextRecognition native module is not linked. ' +
            'Rebuild the app with EAS to include @react-native-ml-kit/text-recognition.',
        );
        const serverResult = await tryServerFallback(uri, controller.signal);
        // [BUG-681] After every await, drop the result if cancel() fired
        // mid-flight. Without this, server OCR completing after cancel would
        // setState 'done', re-opening a screen the user already dismissed.
        if (controller.signal.aborted) return;
        if (serverResult && resolveSuccess(serverResult, 'server')) {
          return;
        }
        if (serverResult?.text) {
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE);
          return;
        }
        finishAsError(
          Platform.OS === 'android'
            ? 'Text recognition is not available in this build. A new app build is required.'
            : 'Text recognition is not available. Please rebuild the app.',
        );
        return;
      }

      try {
        const recognized = await recognizeText(uri);
        // [BUG-681] The native ML Kit call cannot be aborted, so the only
        // defense is to drop its result if the user cancelled while it ran.
        if (controller.signal.aborted) return;
        if (recognized.text) {
          if (shouldEscalateLocalOcr(recognized.text, recognized.confidence)) {
            trackHomeworkOcrGateShortcircuit(
              buildGateMetrics(recognized.text, recognized.confidence),
            );
            const serverResult = await tryServerFallback(
              uri,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            if (serverResult && resolveSuccess(serverResult, 'server')) {
              return;
            }
            if (serverResult?.text) {
              finishAsError(NON_HOMEWORK_ERROR_MESSAGE);
              return;
            }
            finishAsError(
              "We couldn't read that clearly. Try taking the photo again with better lighting.",
            );
            return;
          }

          if (resolveSuccess(recognized, 'local')) {
            return;
          }
          const rejectedMetrics = buildGateMetrics(
            recognized.text,
            recognized.confidence,
          );
          trackHomeworkOcrGateShortcircuit(rejectedMetrics);
          const serverResult = await tryServerFallback(uri, controller.signal);
          if (controller.signal.aborted) return;
          if (serverResult && resolveSuccess(serverResult, 'server')) {
            return;
          }
          if (serverResult?.text) {
            finishAsError(NON_HOMEWORK_ERROR_MESSAGE);
            return;
          }
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE);
          return;
        }
        const serverResult = await tryServerFallback(uri, controller.signal);
        if (controller.signal.aborted) return;
        if (serverResult && resolveSuccess(serverResult, 'server')) {
          return;
        }
        if (serverResult?.text) {
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE);
          return;
        }
        finishAsError("Couldn't read any text from the image");
      } catch (err) {
        // [BUG-681] If recognizeText threw because we aborted (rare — the
        // native module typically does not honor signals), treat as a cancel
        // and exit without a user-visible error.
        if (controller.signal.aborted) return;
        console.error('[OCR] Text recognition failed:', err);
        const serverResult = await tryServerFallback(uri, controller.signal);
        if (controller.signal.aborted) return;
        if (serverResult && resolveSuccess(serverResult, 'server')) {
          return;
        }
        if (serverResult?.text) {
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE);
          return;
        }
        finishAsError(
          "We couldn't read that clearly. Try taking the photo again with better lighting.",
        );
      }
    },
    [finishAsError, resolveSuccess, tryServerFallback],
  );

  const process = useCallback(
    async (uri: string) => {
      // M-03: wrap copyToCache in try/catch so failures set error state
      let stableUri: string;
      try {
        stableUri = await copyToCache(uri);
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Failed to cache image');
        return;
      }
      currentUriRef.current = stableUri;
      await runOcr(stableUri, false);
    },
    [runOcr],
  );

  const retry = useCallback(async () => {
    if (!currentUriRef.current) return;
    await runOcr(currentUriRef.current, true);
  }, [runOcr]);

  return { text, status, error, failCount, process, retry, cancel };
}
