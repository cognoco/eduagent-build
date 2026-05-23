import { useState, useCallback, useRef, useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl } from '../lib/api';
import { fetchOrThrowNetworkError, UpstreamError } from '../lib/api-errors';
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
import { Sentry } from '../lib/sentry';

/**
 * Check whether the ML Kit native module is linked in this build.
 * Returns false for dev-client builds that predate the ML Kit dependency.
 */
function isTextRecognitionAvailable(): boolean {
  return NativeModules.TextRecognition != null;
}

export type OcrStatus = 'idle' | 'processing' | 'done' | 'error';

export type OcrErrorCode =
  | 'NOT_HOMEWORK'
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

function stripListMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+|[A-Z])[.)]?\s+/, ''))
    .join('\n');
}

// Real homework math has digits/operators in STANDALONE tokens (e.g., "5",
// "+", "x²", "12.5"). ML Kit garble like "Shob608rgg" has a digit run buried
// inside a letter run — that should NOT count as a math cue, otherwise any
// confidently-misread handwriting passes the gate as long as it contains a
// stray digit. Require ≥2 math-like tokens AND at least one operator or
// algebra-shaped token — two bare digit tokens like "5 5" or "12 15"
// (page numbers, prices stripped of currency, dates) are NOT a math
// expression and would otherwise let receipt/calendar photos skip server
// escalation.
function hasMathExpression(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  let mathCount = 0;
  let hasOperatorOrAlgebra = false;
  for (const rawToken of tokens) {
    const token = rawToken.replace(/[.,;]+$/, '');
    if (!token) continue;
    // Pure digit run (with optional decimal)
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      mathCount++;
      continue;
    }
    // Pure operator run
    if (/^[+\-−×*·÷/=<>≤≥±²³]+$/.test(token)) {
      mathCount++;
      hasOperatorOrAlgebra = true;
      continue;
    }
    // Algebra-shaped token: only letters, digits, and math symbols, with at
    // least one digit AND no run of letters longer than 2 chars (rules out
    // garble like "Shob608rgg" while admitting "5x", "2y²", "x=10", "3a+b").
    if (
      /^[\p{L}\d+\-−×*·÷/=<>≤≥±²³.()]+$/u.test(token) &&
      /\d/.test(token) &&
      !/\p{L}{3,}/u.test(token)
    ) {
      mathCount++;
      hasOperatorOrAlgebra = true;
    }
  }
  return mathCount >= 2 && hasOperatorOrAlgebra;
}

function hasStrongHomeworkCue(text: string): boolean {
  const contentText = stripListMarkers(text);

  if (hasMathExpression(contentText)) {
    return true;
  }

  if (/[?!:]/.test(contentText)) {
    return true;
  }

  return /\b(?:answer|calculate|choose|circle|compare|complete|conjugate|contrast|correct|define|describe|draw|evaluate|explain|factor|fill|find|graph|how|identify|label|prove|read|select|show|simplify|solve|translate|underline|what|when|where|which|who|why|write)\b/iu.test(
    contentText,
  );
}

// Detect ML Kit OCR garble that the homework-cue gate would otherwise wave
// through. Handwritten math frequently comes back as something like
// "S - 3+ z" — passes hasStrongHomeworkCue (contains a digit) and squeaks
// past isLikelyHomework (only 2 letter-runs, so the avg-letter-run-length
// guard at letterRuns.length >= 3 doesn't fire). The result: noisy local
// text is accepted and the LLM is never consulted, even though the LLM
// would read the original photo correctly. Heuristic: when the text has
// letters but the average letter-run length is below 2 characters, those
// "letters" are almost certainly noise rather than words — escalate to the
// server LLM. Pure math/symbol input (no letter runs) is unaffected.
function looksLikeOcrGarble(text: string): boolean {
  const contentText = stripListMarkers(text);
  const letterRuns = contentText.match(/\p{L}+/gu) ?? [];
  if (letterRuns.length === 0) return false;
  const avgLetterRunLength =
    letterRuns.reduce((sum, run) => sum + run.length, 0) / letterRuns.length;
  return avgLetterRunLength < 2;
}

function shouldEscalateLocalOcr(text: string, confidence?: number): boolean {
  if (confidence != null && confidence < 0.75) {
    return true;
  }

  if (looksLikeOcrGarble(text)) {
    return true;
  }

  // If the text has NO strong homework cue (no standalone math tokens, no
  // question/colon punctuation, no homework verb), the ML Kit output isn't
  // recognisably homework. Escalate to the server LLM regardless of length —
  // previously this only escalated for short results (≤8 words / ≤5 lines),
  // which let long confident-but-garbled outputs through (e.g., handwriting
  // misread as "Rad / meol bs / Homo mino Shob608rgg / ..." passes only
  // because of the embedded digit; with hasMathExpression that no longer
  // counts as a cue, and now the length gate doesn't either).
  return !hasStrongHomeworkCue(text);
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
  const [errorCode, setErrorCode] = useState<OcrErrorCode | undefined>(
    undefined,
  );
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
    setStatus('error');
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current?.abort();
    cancelRef.current = null;
    if (!mountedRef.current) return;
    setStatus('idle');
    setError(null);
    setErrorCode(undefined);
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
        // Silent recovery ban (CLAUDE.md fix-development rule): the user sees
        // a generic "couldn't read" error when the server LLM path fails for
        // any reason (missing GEMINI_API_KEY → 500, network error, malformed
        // response → 502, auth → 401). Without Sentry, the LLM appears
        // "disconnected" but we have no visibility. Capture so we can triage.
        console.error('[OCR] Server fallback failed:', err);
        Sentry.captureException(err, {
          tags: {
            component: 'use-homework-ocr',
            action: 'server-fallback',
          },
        });
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
      setErrorCode(undefined);
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
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE, 'NOT_HOMEWORK');
          return;
        }
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
              finishAsError(NON_HOMEWORK_ERROR_MESSAGE, 'NOT_HOMEWORK');
              return;
            }
            finishAsError(
              "We couldn't read that clearly. Try taking the photo again with better lighting.",
              'LOW_QUALITY',
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
            finishAsError(NON_HOMEWORK_ERROR_MESSAGE, 'NOT_HOMEWORK');
            return;
          }
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE, 'NOT_HOMEWORK');
          return;
        }
        const serverResult = await tryServerFallback(uri, controller.signal);
        if (controller.signal.aborted) return;
        if (serverResult && resolveSuccess(serverResult, 'server')) {
          return;
        }
        if (serverResult?.text) {
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE, 'NOT_HOMEWORK');
          return;
        }
        finishAsError("Couldn't read any text from the image", 'NO_TEXT');
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
          finishAsError(NON_HOMEWORK_ERROR_MESSAGE, 'NOT_HOMEWORK');
          return;
        }
        finishAsError(
          "We couldn't read that clearly. Try taking the photo again with better lighting.",
          'LOW_QUALITY',
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
        setErrorCode('CACHE_FAILED');
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

  return { text, status, error, errorCode, failCount, process, retry, cancel };
}
