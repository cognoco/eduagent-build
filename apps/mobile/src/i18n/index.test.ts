import { resolveLanguage, SUPPORTED_LANGUAGES } from './index';

describe('resolveLanguage', () => {
  it('returns stored language when it is a supported language', () => {
    expect(resolveLanguage('en', 'en')).toBe('en');
  });

  it('ignores stored language that is not supported', () => {
    expect(resolveLanguage('ar', 'de')).toBe('en');
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
  it('is locked to en-only until translation lands', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en']);
  });
});
