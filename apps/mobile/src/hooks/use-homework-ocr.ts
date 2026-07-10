import { useState, useCallback, useRef, useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useAuth } from '@clerk/expo';
import { ocrResultSchema } from '@eduagent/schemas';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl } from '../lib/api';
import {
  fetchOrThrowNetworkError,
  NetworkError,
  UpstreamError,
} from '../lib/api-errors';
import { useProfile } from '../lib/profile';
import {
  countMeaningfulTokens,
  isLikelyHomework,
  splitHomeworkProblems,
} from '../components/homework/problem-cards';
import { isCleanPrintedLocalRead } from './ocr-read-quality';
import {
  trackHomeworkOcrGateAccepted,
  trackHomeworkOcrGateRejected,
  trackHomeworkOcrGateShortcircuit,
  type HomeworkOcrGateSource,
} from '../lib/analytics';
import { Sentry } from '../lib/sentry';
import { parseJson } from '../lib/parse-json';

/**
 * Check whether the ML Kit native module is linked in this build.
 * Returns false for dev-client builds that predate the ML Kit dependency.
 */
function isTextRecognitionAvailable(): boolean {
  return NativeModules.TextRecognition != null;
}

export type OcrStatus = 'idle' | 'processing' | 'done' | 'error';

export type OcrErrorCode =
  | 'LOW_QUALITY'
  | 'NO_TEXT'
  | 'ML_KIT_UNAVAILABLE'
  | 'CACHE_FAILED'
  | 'NETWORK_ERROR'
  | 'AUTH_EXPIRED'
  | 'IMAGE_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

export interface UseHomeworkOcrResult {
  text: string | null;
  status: OcrStatus;
  error: string | null;
  errorCode: OcrErrorCode | undefined;
  source: HomeworkOcrGateSource | null;
  failCount: number;
  process: (uri: string) => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => void;
}

type RecognizedTextResult = {
  text: string | null;
  confidence?: number;
};

type ServerFallbackOutcome =
  | { kind: 'recognized'; recognized: RecognizedTextResult }
  | { kind: 'aborted' }
  | { kind: 'failed'; code: OcrErrorCode; message: string };

function classifyUpstreamStatus(status: number): {
  code: OcrErrorCode;
  message: string;
} {
  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_EXPIRED',
      message: 'Your session expired. Sign in again to keep going.',
    };
  }
  if (status === 413) {
    return {
      code: 'IMAGE_TOO_LARGE',
      message:
        "That photo's too big. Try a smaller crop or retake from further back.",
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      message: "You've hit the photo limit for now. Try again in a minute.",
    };
  }
  return {
    code: 'SERVER_ERROR',
    message: 'Our servers are taking a moment. Try again in a few seconds.',
  };
}

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
    // [CR-2026-05-21-156] Wrap so network-layer rejections become typed
    // NetworkError instead of raw TypeError. format-api-error.ts classifies
    // typed errors directly; the legacy TypeError string-match branch was
    // removed as part of this fix.
    response = await fetchOrThrowNetworkError(`${getApiUrl()}/v1/ocr`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response || !response.ok) {
    // Throw typed UpstreamError so the caller can branch on status. A bare
    // Error caused every 4xx/5xx (401 auth lapse, 413 too large, 429 rate-limit)
    // to surface the same generic "couldn't read clearly" message via the
    // catch-all fallback, hiding real problems.
    const status = response?.status ?? 0;
    throw new UpstreamError(
      `Server OCR failed (${status || 'unknown'})`,
      'OCR_UPSTREAM',
      status,
    );
  }

  const payload = await parseJson(response, ocrResultSchema, 'POST /v1/ocr');
  const text = payload.text?.trim();
  return {
    text: text || null,
    confidence: payload.confidence,
  };
}

export function useHomeworkOcr(): UseHomeworkOcrResult {
  const { getToken } = useAuth();
  const { activeProfile } = useProfile();
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<OcrErrorCode | undefined>(
    undefined,
  );
  const [source, setSource] = useState<HomeworkOcrGateSource | null>(null);
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

  const finishAsError = useCallback((message: string, code: OcrErrorCode) => {
    if (!mountedRef.current) return;
    setFailCount((prev) => prev + 1);
    setError(message);
    setErrorCode(code);
    setSource(null);
    setStatus('error');
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current?.abort();
    cancelRef.current = null;
    if (!mountedRef.current) return;
    setStatus('idle');
    setError(null);
    setErrorCode(undefined);
    setSource(null);
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
      setErrorCode(undefined);
      setSource(source);
      setStatus('done');
      trackHomeworkOcrGateAccepted({ source, ...metrics });
      return true;
    },
    [],
  );

  const acceptServerRead = useCallback((recognized: RecognizedTextResult) => {
    if (!recognized.text || countMeaningfulTokens(recognized.text) < 1) {
      return false;
    }

    setText(recognized.text);
    setError(null);
    setErrorCode(undefined);
    setSource('server');
    setStatus('done');
    trackHomeworkOcrGateAccepted({
      source: 'server',
      ...buildGateMetrics(recognized.text, recognized.confidence),
    });
    return true;
  }, []);

  const tryServerFallback = useCallback(
    async (
      uri: string,
      signal?: AbortSignal,
    ): Promise<ServerFallbackOutcome> => {
      try {
        const token = await getToken();
        const recognized = await recognizeTextServerSide(
          uri,
          token ?? null,
          activeProfile?.id,
          signal,
        );
        return { kind: 'recognized', recognized };
      } catch (err) {
        // [BUG-681] Distinguish user-initiated cancel from a real failure so
        // we do not surface a "server failed" error after a deliberate cancel.
        if ((err as { name?: string } | null)?.name === 'AbortError') {
          return { kind: 'aborted' };
        }
        // Capture for triage. Classifying the error to a typed outcome below
        // means 401 / 413 / 429 / 5xx each get distinct user-visible copy
        // instead of being flattened to the same "couldn't read clearly"
        // message at the screen layer.
        console.error('[OCR] Server fallback failed:', err);
        Sentry.captureException(err, {
          tags: {
            component: 'use-homework-ocr',
            action: 'server-fallback',
          },
        });
        if (err instanceof UpstreamError) {
          const { code, message } = classifyUpstreamStatus(err.status);
          return { kind: 'failed', code, message };
        }
        if (err instanceof NetworkError) {
          return {
            kind: 'failed',
            code: 'NETWORK_ERROR',
            message:
              "Looks like you're offline. Check your connection and try again.",
          };
        }
        return {
          kind: 'failed',
          code: 'SERVER_ERROR',
          message:
            'Our servers are taking a moment. Try again in a few seconds.',
        };
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
      setErrorCode(undefined);
      setSource(null);
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
        const outcome = await tryServerFallback(uri, controller.signal);
        // [BUG-681] After every await, drop the result if cancel() fired
        // mid-flight. Without this, server OCR completing after cancel would
        // setState 'done', re-opening a screen the user already dismissed.
        if (controller.signal.aborted || outcome.kind === 'aborted') return;
        if (outcome.kind === 'failed') {
          finishAsError(outcome.message, outcome.code);
          return;
        }
        const serverResult = outcome.recognized;
        if (acceptServerRead(serverResult)) return;
        finishAsError(
          Platform.OS === 'android'
            ? 'Text recognition is not available in this build. A new app build is required.'
            : 'Text recognition is not available. Please rebuild the app.',
          'ML_KIT_UNAVAILABLE',
        );
        return;
      }

      try {
        const recognized = await recognizeText(uri);
        // [BUG-681] The native ML Kit call cannot be aborted, so the only
        // defense is to drop its result if the user cancelled while it ran.
        if (controller.signal.aborted) return;
        if (recognized.text) {
          if (isCleanPrintedLocalRead(recognized.text)) {
            if (resolveSuccess(recognized, 'local')) {
              return;
            }
            const rejectedMetrics = buildGateMetrics(
              recognized.text,
              recognized.confidence,
            );
            trackHomeworkOcrGateShortcircuit(rejectedMetrics);
            const outcome = await tryServerFallback(uri, controller.signal);
            if (controller.signal.aborted || outcome.kind === 'aborted') return;
            if (outcome.kind === 'failed') {
              finishAsError(outcome.message, outcome.code);
              return;
            }
            const serverResult = outcome.recognized;
            if (acceptServerRead(serverResult)) return;
            finishAsError("Couldn't read any text from the image", 'NO_TEXT');
            return;
          }

          trackHomeworkOcrGateShortcircuit(
            buildGateMetrics(recognized.text, recognized.confidence),
          );
          const outcome = await tryServerFallback(uri, controller.signal);
          if (controller.signal.aborted || outcome.kind === 'aborted') return;
          if (outcome.kind === 'failed') {
            finishAsError(outcome.message, outcome.code);
            return;
          }
          const serverResult = outcome.recognized;
          if (acceptServerRead(serverResult)) return;
          finishAsError(
            "We couldn't read that clearly. Try taking the photo again with better lighting.",
            'LOW_QUALITY',
          );
          return;
        }
        const outcome = await tryServerFallback(uri, controller.signal);
        if (controller.signal.aborted || outcome.kind === 'aborted') return;
        if (outcome.kind === 'failed') {
          finishAsError(outcome.message, outcome.code);
          return;
        }
        const serverResult = outcome.recognized;
        if (acceptServerRead(serverResult)) return;
        finishAsError("Couldn't read any text from the image", 'NO_TEXT');
      } catch (err) {
        // [BUG-681] If recognizeText threw because we aborted (rare — the
        // native module typically does not honor signals), treat as a cancel
        // and exit without a user-visible error.
        if (controller.signal.aborted) return;
        console.error('[OCR] Text recognition failed:', err);
        const outcome = await tryServerFallback(uri, controller.signal);
        if (controller.signal.aborted || outcome.kind === 'aborted') return;
        if (outcome.kind === 'failed') {
          finishAsError(outcome.message, outcome.code);
          return;
        }
        const serverResult = outcome.recognized;
        if (acceptServerRead(serverResult)) return;
        finishAsError(
          "We couldn't read that clearly. Try taking the photo again with better lighting.",
          'LOW_QUALITY',
        );
      }
    },
    [acceptServerRead, finishAsError, resolveSuccess, tryServerFallback],
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
        setErrorCode('CACHE_FAILED');
        setSource(null);
        setFailCount((prev) => prev + 1);
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

  return {
    text,
    status,
    error,
    errorCode,
    source,
    failCount,
    process,
    retry,
    cancel,
  };
}
