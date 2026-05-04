import { resolveLanguage, SUPPORTED_LANGUAGES } from './index';

describe('resolveLanguage', () => {
  it('returns stored language when it is a supported language', () => {
    expect(resolveLanguage('en', 'en')).toBe('en');
  });

  it('ignores stored language that is not supported (falls back to device)', () => {
    // 'ar' isn't supported; device 'de' is, so resolution lands on 'de'.
    expect(resolveLanguage('ar', 'de')).toBe('de');
  });

  it('falls back to en when stored is unsupported and device is unsupported', () => {
    expect(resolveLanguage('ar', 'ko')).toBe('en');
  });

  it('returns device language when no stored language and device is supported', () => {
    expect(resolveLanguage(null, 'en')).toBe('en');
  });

  it('falls back to en when neither stored nor device language is supported', () => {
    expect(resolveLanguage(null, 'ar')).toBe('en');
    expect(resolveLanguage('zh', 'ko')).toBe('en');
  });

  it('handles empty string stored language as no override', () => {
    expect(resolveLanguage('', 'en')).toBe('en');
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('exposes the seven launch locales', () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      'en',
      'de',
      'es',
      'ja',
      'nb',
      'pl',
      'pt',
    ]);
  });
});
