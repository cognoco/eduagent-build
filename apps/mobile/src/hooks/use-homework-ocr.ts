import { useState, useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl } from '../lib/api';
import { useProfile } from '../lib/profile';

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

async function recognizeText(imageUri: string): Promise<string | null> {
  const resizedUri = await resizeImage(imageUri);
  const result = await Promise.race([
    TextRecognition.recognize(resizedUri),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('On-device text recognition timed out')),
        OCR_DEVICE_TIMEOUT_MS
      )
    ),
  ]);
  const text = result.text?.trim();
  return text || null;
}

async function recognizeTextServerSide(
  imageUri: string,
  token: string | null,
  profileId?: string
): Promise<string | null> {
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

  const payload = (await response.json()) as { text?: string | null };
  const text = payload.text?.trim();
  return text || null;
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

  const cancel = useCallback(() => {
    cancelRef.current?.abort();
    cancelRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  const tryServerFallback = useCallback(
    async (uri: string): Promise<boolean> => {
      try {
        const token = await getToken();
        const recognized = await recognizeTextServerSide(
          uri,
          token ?? null,
          activeProfile?.id
        );
        if (!recognized) {
          return false;
        }
        setText(recognized);
        setStatus('done');
        return true;
      } catch (err) {
        console.error('[OCR] Server fallback failed:', err);
        return false;
      }
    },
    [activeProfile?.id, getToken]
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

      if (controller.signal.aborted) return;

      if (!isTextRecognitionAvailable()) {
        console.error(
          '[OCR] ML Kit TextRecognition native module is not linked. ' +
            'Rebuild the app with EAS to include @react-native-ml-kit/text-recognition.'
        );
        if (await tryServerFallback(uri)) {
          return;
        }
        setFailCount((prev) => prev + 1);
        setError(
          Platform.OS === 'android'
            ? 'Text recognition is not available in this build. A new app build is required.'
            : 'Text recognition is not available. Please rebuild the app.'
        );
        setStatus('error');
        return;
      }

      try {
        const recognized = await recognizeText(uri);
        if (!recognized) {
          if (await tryServerFallback(uri)) {
            return;
          }
          setFailCount((prev) => prev + 1);
          setError("Couldn't read any text from the image");
          setStatus('error');
          return;
        }
        setText(recognized);
        setStatus('done');
      } catch (err) {
        console.error('[OCR] Text recognition failed:', err);
        if (await tryServerFallback(uri)) {
          return;
        }
        setFailCount((prev) => prev + 1);
        setError(
          "We couldn't read that clearly. Try taking the photo again with better lighting."
        );
        setStatus('error');
      }
    },
    [tryServerFallback]
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
    [runOcr]
  );

  const retry = useCallback(async () => {
    if (!currentUriRef.current) return;
    await runOcr(currentUriRef.current, true);
  }, [runOcr]);

  return { text, status, error, failCount, process, retry, cancel };
}
