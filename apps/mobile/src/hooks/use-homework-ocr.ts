import { useState, useCallback, useRef } from 'react';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

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
  const result = await manipulateAsync(uri, [{ resize: { width: 1024 } }], {
    format: SaveFormat.JPEG,
    compress: 0.8,
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
    } catch {
      setFailCount((prev) => prev + 1);
      setError('Something went wrong reading that');
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
