import { resolveLanguage, SUPPORTED_LANGUAGES } from './index';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';
import nb from './locales/nb.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';

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

describe('launch locale key parity', () => {
  const locales = { de, es, ja, nb, pl, pt } as const;

  it('keeps practice summary activity labels translated in every locale', () => {
    const sections = ['activityTypes', 'activitySubtypes'] as const;

    for (const messages of Object.values(locales)) {
      for (const section of sections) {
        expect(
          Object.keys(messages.parentView.practiceSummary[section]).sort(),
        ).toEqual(Object.keys(en.parentView.practiceSummary[section]).sort());
      }
    }
  });
});
