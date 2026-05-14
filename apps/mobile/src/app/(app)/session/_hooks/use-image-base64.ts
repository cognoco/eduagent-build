import { useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system';

type Mime = 'image/jpeg' | 'image/png' | 'image/webp';

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
} {
  const imageBase64Ref = useRef<string | null>(null);
  const imageMimeTypeRef = useRef<Mime | null>(null);

  useEffect(() => {
    if (!imageUri) return;
    const uri = imageUri;
    let cancelled = false;

    async function convertImage() {
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        if (cancelled) return;
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
      } catch (err) {
        console.warn('[Session] Failed to read image as base64:', err);
      }
    }

    void convertImage();
    return () => {
      cancelled = true;
    };
  }, [imageUri, imageMimeType]);

  return { imageBase64Ref, imageMimeTypeRef };
}
