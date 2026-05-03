import { resolveLanguage, SUPPORTED_LANGUAGES } from './index';

describe('resolveLanguage', () => {
  it('returns stored language when it is a supported language', () => {
    expect(resolveLanguage('nb', 'en')).toBe('nb');
  });

  it('ignores stored language that is not supported', () => {
    expect(resolveLanguage('ar', 'de')).toBe('de');
  });

  it('returns device language when no stored language and device is supported', () => {
    expect(resolveLanguage(null, 'ja')).toBe('ja');
  });

  it('falls back to en when neither stored nor device language is supported', () => {
    expect(resolveLanguage(null, 'ar')).toBe('en');
    expect(resolveLanguage('zh', 'ko')).toBe('en');
  });

  it('handles empty string stored language as no override', () => {
    expect(resolveLanguage('', 'es')).toBe('es');
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('contains exactly the 7 target languages', () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      'en',
      'nb',
      'de',
      'es',
      'pt',
      'pl',
      'ja',
    ]);
  });
});
