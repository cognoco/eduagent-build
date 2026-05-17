import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';

type Mime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ImageAttachmentStatus =
  | 'none'
  | 'loading'
  | 'ready'
  | 'failed'
  | 'timeout';

const IMAGE_READ_TIMEOUT_MS = 2_500;

/**
 * Reads an image URI as base64 once and stores it (plus its mime type) in
 * refs so streaming requests can attach it without re-reading on each send.
 *
 * Mime type resolution prefers the route-supplied `imageMimeType` (camera
 * captures pass JPEG; gallery picks pass OS-level mime) and falls back to
 * file-extension sniffing for deep links or missing values. [IMP-1]
 */
export function useImageBase64(
  imageUri: string | undefined,
  imageMimeType: string | undefined,
): {
  imageBase64Ref: React.MutableRefObject<string | null>;
  imageMimeTypeRef: React.MutableRefObject<Mime | null>;
  imageAttachmentStatus: ImageAttachmentStatus;
} {
  const imageBase64Ref = useRef<string | null>(null);
  const imageMimeTypeRef = useRef<Mime | null>(null);
  const [imageAttachmentStatus, setImageAttachmentStatus] =
    useState<ImageAttachmentStatus>(imageUri ? 'loading' : 'none');

  useEffect(() => {
    imageBase64Ref.current = null;
    imageMimeTypeRef.current = null;

    if (!imageUri) {
      setImageAttachmentStatus('none');
      return undefined;
    }

    const uri = imageUri;
    let cancelled = false;
    let timedOut = false;
    setImageAttachmentStatus('loading');
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (!cancelled) {
        setImageAttachmentStatus('timeout');
      }
    }, IMAGE_READ_TIMEOUT_MS);

    async function convertImage() {
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        if (cancelled || timedOut) return;
        clearTimeout(timeoutId);
        imageBase64Ref.current = base64;
        const ext = uri.split('.').pop()?.toLowerCase();
        const mimeType: Mime =
          imageMimeType === 'image/png'
            ? 'image/png'
            : imageMimeType === 'image/webp'
              ? 'image/webp'
              : imageMimeType?.includes('jpeg') ||
                  imageMimeType?.includes('jpg')
                ? 'image/jpeg'
                : ext === 'png'
                  ? 'image/png'
                  : ext === 'webp'
                    ? 'image/webp'
                    : 'image/jpeg';
        imageMimeTypeRef.current = mimeType;
        setImageAttachmentStatus('ready');
      } catch (err) {
        if (cancelled || timedOut) return;
        clearTimeout(timeoutId);
        imageBase64Ref.current = null;
        imageMimeTypeRef.current = null;
        setImageAttachmentStatus('failed');
        console.warn('[Session] Failed to read image as base64:', err);
      }
    }

    void convertImage();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [imageUri, imageMimeType]);

  return { imageBase64Ref, imageMimeTypeRef, imageAttachmentStatus };
}
