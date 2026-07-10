import { conversationLanguageSchema } from '@eduagent/schemas';
import {
  getVoiceLocaleForLanguage,
  LANGUAGE_LOCALES,
} from './language-locales';

describe('getVoiceLocaleForLanguage', () => {
  it('falls back to en-US for a missing language code', () => {
    expect(getVoiceLocaleForLanguage(undefined)).toBe('en-US');
    expect(getVoiceLocaleForLanguage(null)).toBe('en-US');
  });

  it.each([
    ['en', 'en-US'],
    ['cs', 'cs-CZ'],
    ['ja', 'ja-JP'],
    ['pl', 'pl-PL'],
  ])('resolves "%s" to "%s"', (languageCode, expectedLocale) => {
    expect(getVoiceLocaleForLanguage(languageCode)).toBe(expectedLocale);
  });

  // Guard (WI-1447 AC #5): every conversationLanguageSchema value must have an
  // EXPLICIT LANGUAGE_LOCALES entry, not merely happen to coincide with the
  // `?? 'en-US'` fallback. Adding a new conversation language to the schema
  // without a matching locale entry must fail this test, not ship silently.
  it('has an explicit locale entry for every conversationLanguageSchema value', () => {
    for (const code of conversationLanguageSchema.options) {
      expect(LANGUAGE_LOCALES).toHaveProperty(code);
    }
  });
});
