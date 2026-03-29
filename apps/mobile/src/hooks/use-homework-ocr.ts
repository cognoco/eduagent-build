import { useState, useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

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

async function recognizeText(imageUri: string): Promise<string | null> {
  const resizedUri = await resizeImage(imageUri);
  const result = await TextRecognition.recognize(resizedUri);
  const text = result.text?.trim();
  return text || null;
}

export function useHomeworkOcr(): UseHomeworkOcrResult {
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const currentUriRef = useRef<string | null>(null);

  const runOcr = useCallback(async (uri: string, isRetry: boolean) => {
    setStatus('processing');
    setError(null);
    if (!isRetry) {
      setText(null);
      setFailCount(0);
    }

    if (!isTextRecognitionAvailable()) {
      console.error(
        '[OCR] ML Kit TextRecognition native module is not linked. ' +
          'Rebuild the app with EAS to include @react-native-ml-kit/text-recognition.'
      );
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
        setFailCount((prev) => prev + 1);
        setError("Couldn't read any text from the image");
        setStatus('error');
        return;
      }
      setText(recognized);
      setStatus('done');
    } catch (err) {
      console.error('[OCR] Text recognition failed:', err);
      setFailCount((prev) => prev + 1);
      setError(
        "We couldn't read that clearly. Try taking the photo again with better lighting."
      );
      setStatus('error');
    }
  }, []);

  const process = useCallback(
    async (uri: string) => {
      const stableUri = await copyToCache(uri);
      currentUriRef.current = stableUri;
      await runOcr(stableUri, false);
    },
    [runOcr]
  );

  const retry = useCallback(async () => {
    if (!currentUriRef.current) return;
    await runOcr(currentUriRef.current, true);
  }, [runOcr]);

  return { text, status, error, failCount, process, retry };
}
