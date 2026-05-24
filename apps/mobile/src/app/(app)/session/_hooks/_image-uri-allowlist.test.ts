/**
 * [WI-284 / DS-195] Allowlist tests for image URIs accepted by the session
 * screen's homework attachment pipeline.
 */

// Mock expo-file-system's directory constants at fixed values so the
// allowlist comparison is deterministic in tests. Use representative
// Expo paths (Android-style cache + iOS-style document) so a future
// refactor doesn't accidentally narrow the allowlist to one platform.
import { isAllowedImageUri } from './_image-uri-allowlist';

// The implementation imports from `expo-file-system/legacy` to access
// the string `cacheDirectory` / `documentDirectory` properties; mock
// that entry point so tests aren't coupled to whichever sub-path the
// non-legacy surface exposes in the current SDK.
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory:
    'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test/',
  documentDirectory:
    'file:///data/user/0/host.exp.exponent/files/ExperienceData/test/',
}));

describe('isAllowedImageUri [WI-284]', () => {
  describe('legitimate camera/gallery flow', () => {
    it('allows a file:// URI inside FileSystem.cacheDirectory (the canonical capture target)', () => {
      // use-homework-ocr.ts copies camera/gallery captures to
      // `${FileSystem.cacheDirectory}homework-<timestamp>.jpg`.
      expect(
        isAllowedImageUri(
          'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test/homework-1700000000000.jpg',
        ),
      ).toBe(true);
    });

    it('allows a file:// URI inside FileSystem.documentDirectory', () => {
      expect(
        isAllowedImageUri(
          'file:///data/user/0/host.exp.exponent/files/ExperienceData/test/saved-homework.png',
        ),
      ).toBe(true);
    });
  });

  describe('[BREAK] rejects deep-link / path-traversal payloads', () => {
    it('rejects a file:// URI outside the allowed roots (DS-195: /etc/hosts)', () => {
      expect(isAllowedImageUri('file:///etc/hosts')).toBe(false);
    });

    it('rejects a file:// URI to user data outside the app sandbox', () => {
      expect(
        isAllowedImageUri('file:///data/data/com.attacker/secret.txt'),
      ).toBe(false);
    });

    it('rejects a URI that uses `..` segments to escape an allowed root', () => {
      expect(
        isAllowedImageUri(
          'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test/../../../../etc/hosts',
        ),
      ).toBe(false);
    });

    it('rejects a URI with percent-encoded `..` segments', () => {
      // After decodeURIComponent, the path contains `..`. The check uses
      // the decoded form so percent-encoding cannot bypass it.
      expect(
        isAllowedImageUri(
          'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test/%2E%2E/%2E%2E/etc/hosts',
        ),
      ).toBe(false);
    });

    it('rejects malformed percent-encoding (defensive)', () => {
      // Treat malformed encoding as suspicious — refuse rather than try to
      // interpret partial bytes as a path component.
      expect(
        isAllowedImageUri(
          'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test/%E0%A4%A.jpg',
        ),
      ).toBe(false);
    });
  });

  describe('[BREAK] rejects non-file:// schemes the readAsStringAsync flow cannot safely handle', () => {
    it.each([
      ['content://com.attacker.fileprovider/x/y'],
      ['http://example.com/image.jpg'],
      ['https://example.com/image.jpg'],
      ['mentomate://homework?imageUri=...'],
      ['data:image/png;base64,AAAA'],
      ['javascript:alert(1)'],
      ['/etc/hosts'], // bare absolute path with no scheme
      [''],
    ])('rejects %s', (uri) => {
      expect(isAllowedImageUri(uri)).toBe(false);
    });
  });

  describe('handles null/undefined/empty without crashing', () => {
    it('returns false for nullish values', () => {
      expect(isAllowedImageUri(undefined)).toBe(false);
      expect(isAllowedImageUri(null)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-87 review] Separate suite with a directory constant that lacks the
// documented trailing slash. Exercises the defensive normalisation in
// decodeFileSystemRoot — without it, `startsWith` on a slash-less root
// matches a sibling directory whose name extends the root with a non-`/`
// suffix (prefix-confusion). The test guarantees we don't slip back into
// that bypass if a future Expo SDK drops the documented trailing slash.
// ---------------------------------------------------------------------------

describe('isAllowedImageUri [WI-87 review] — trailing-slash invariant', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-file-system/legacy', () => ({
      cacheDirectory:
        'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test',
      documentDirectory: undefined,
    }));
  });

  it('rejects a sibling directory that extends the slash-less root with a non-/ suffix', () => {
    const { isAllowedImageUri: scopedIsAllowed } =
      require('./_image-uri-allowlist') as typeof import('./_image-uri-allowlist');
    expect(
      scopedIsAllowed(
        'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test_attacker/x.jpg',
      ),
    ).toBe(false);
  });

  it('still allows a URI directly under the slash-less root (with the synthesised trailing /)', () => {
    const { isAllowedImageUri: scopedIsAllowed } =
      require('./_image-uri-allowlist') as typeof import('./_image-uri-allowlist');
    expect(
      scopedIsAllowed(
        'file:///data/user/0/host.exp.exponent/cache/ExperienceData/test/homework.jpg',
      ),
    ).toBe(true);
  });
});
