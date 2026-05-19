// ---------------------------------------------------------------------------
// [BUG-131] secure-storage web fallback disclosure.
//
// On web, this module silently falls back to plain localStorage. Pre-fix
// there was no runtime signal that callers were writing sensitive values into
// an unencrypted store — an audit reading only the call-site would assume
// Keychain/Keystore semantics on every platform. The fix logs a single
// warning the first time the web fallback fires per process. These tests
// pin that contract.
// ---------------------------------------------------------------------------

import {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  sanitizeSecureStoreKey,
  __resetWebFallbackWarning,
} from './secure-storage';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('secure-storage sanitizer (platform-agnostic)', () => {
  it('replaces unsupported characters with underscore', () => {
    expect(sanitizeSecureStoreKey('a:b/c=d')).toBe('a_b_c_d');
  });

  it('preserves the allowed character set', () => {
    expect(sanitizeSecureStoreKey('abc-123._XY')).toBe('abc-123._XY');
  });
});

describe('[BUG-131] secure-storage web fallback warning', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    __resetWebFallbackWarning();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Reset localStorage between tests so values from one don't leak.
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      globalThis.localStorage.clear();
    }
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('[BREAK] emits a warn the first time setItemAsync runs on web', async () => {
    await setItemAsync('demo-key', 'demo-value');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(message).toMatch(/secure-storage/i);
    expect(message).toMatch(/web fallback/i);
    expect(message).toMatch(/not encrypted/i);
  });

  it('[BREAK] never warns more than once per process even across mixed calls', async () => {
    await setItemAsync('k1', 'v1');
    await getItemAsync('k1');
    await setItemAsync('k2', 'v2');
    await deleteItemAsync('k1');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('still round-trips values via the web fallback', async () => {
    await setItemAsync('round-trip', 'hello');
    await expect(getItemAsync('round-trip')).resolves.toBe('hello');
    await deleteItemAsync('round-trip');
    await expect(getItemAsync('round-trip')).resolves.toBeNull();
  });

  it('warns on getItemAsync first call too (covers read-before-write paths)', async () => {
    await getItemAsync('never-written');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('warns on deleteItemAsync first call too (covers cleanup-without-prior-write paths)', async () => {
    await deleteItemAsync('never-written');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
