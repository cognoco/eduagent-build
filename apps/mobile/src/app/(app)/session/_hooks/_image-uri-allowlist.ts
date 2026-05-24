// Use the legacy import path to access `cacheDirectory` and
// `documentDirectory` as plain string properties — the v19+ non-legacy
// surface moved these to `Paths.cache.uri` / `Paths.document.uri`. Matches
// the convention used by apps/mobile/src/hooks/use-homework-ocr.ts (which
// produces the URIs we're allowlisting against).
import * as FileSystem from 'expo-file-system/legacy';

/**
 * [WI-284 / DS-195] Allowlist for image URIs that the session screen will
 * read via `FileSystem.readAsStringAsync` and ship to the homework LLM
 * pipeline.
 *
 * Pre-fix, `useImageBase64` would read any URI handed in via Expo Router
 * params. Because the app exposes the `mentomate://` URL scheme, a
 * crafted deep link could open the session screen with
 * `mode=homework&problemText=...&imageUri=file:///etc/hosts` and the hook
 * would happily read the file and attach the base64 payload to the first
 * streamed homework message — a one-shot local-file exfil via deep link.
 *
 * The legitimate camera/gallery flow always lands a `file://` URI inside
 * `FileSystem.cacheDirectory` (see use-homework-ocr.ts: `copyAsync` to
 * `${FileSystem.cacheDirectory}homework-${Date.now()}.jpg`). Allow exactly
 * those locations:
 *
 *   - file:// URI
 *   - decoded path begins with FileSystem.cacheDirectory or
 *     FileSystem.documentDirectory
 *
 * Any other scheme or path is rejected.
 *
 * Notes:
 *   - The two directories' values are detected once at import-time.
 *     They never change at runtime for an Expo app instance.
 *   - Decoded path comparison handles URL-encoded characters such as
 *     spaces (the canonical capture filename uses a timestamp so no
 *     percent-encoding is currently expected, but a directory containing
 *     a space could appear on simulator paths).
 *   - The check rejects path traversal explicitly: any `..` segment in
 *     the URI's path component disqualifies it, since a directory-prefix
 *     match on a path containing `..` could otherwise escape the
 *     intended root.
 */
export function isAllowedImageUri(uri: string | null | undefined): boolean {
  if (!uri || typeof uri !== 'string') return false;
  if (!uri.startsWith('file://')) return false;
  // Path component after `file://`. Strip the URI scheme and decode
  // percent-encoded characters before comparing against the directory
  // roots (which are returned as decoded absolute paths by Expo).
  let path: string;
  try {
    path = decodeURIComponent(uri.slice('file://'.length));
  } catch {
    // Malformed percent-encoding is suspicious; reject.
    return false;
  }
  if (path.includes('..')) return false;

  const roots: string[] = [];
  const cacheDir = FileSystem.cacheDirectory;
  const docDir = FileSystem.documentDirectory;
  if (cacheDir) roots.push(decodeFileSystemRoot(cacheDir));
  if (docDir) roots.push(decodeFileSystemRoot(docDir));
  if (roots.length === 0) {
    // Defence in depth: if neither directory is known (test/SSR/no-native
    // context), refuse rather than fall open.
    return false;
  }
  return roots.some((root) => path.startsWith(root));
}

function decodeFileSystemRoot(rootUri: string): string {
  // Expo's directory constants are returned as `file://...` URIs. Strip
  // the scheme so the comparison runs on plain absolute paths.
  let value = rootUri.startsWith('file://')
    ? rootUri.slice('file://'.length)
    : rootUri;
  try {
    value = decodeURIComponent(value);
  } catch {
    // If a directory itself somehow contains malformed percent-encoding,
    // use the raw form rather than crashing the allowlist check.
  }
  // [WI-87 review] Defense against a future SDK that drops the documented
  // trailing slash from `cacheDirectory` / `documentDirectory`. Without
  // this, a `startsWith` check on `/data/.../cache` would also accept
  // `/data/.../cache_attacker/x.jpg`. The trailing slash is the directory
  // boundary; force it.
  return value.endsWith('/') ? value : `${value}/`;
}
