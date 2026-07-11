import { conversationLanguageSchema } from '@eduagent/schemas';
import { SUPPORTED_LANGUAGES } from '../i18n';
import {
  CONVERSATION_LANGUAGES,
  CONVERSATION_LANGUAGE_LABELS,
  isConversationOnlyLocale,
} from './conversation-languages';

describe('CONVERSATION_LANGUAGES', () => {
  it('lists all 10 conversationLanguageSchema locales, not just the 7 UI-shell locales', () => {
    expect(CONVERSATION_LANGUAGES).toHaveLength(10);
    expect([...CONVERSATION_LANGUAGES].sort()).toEqual(
      [...conversationLanguageSchema.options].sort(),
    );
  });

  it('has a label entry for every conversation language', () => {
    for (const lang of CONVERSATION_LANGUAGES) {
      expect(CONVERSATION_LANGUAGE_LABELS[lang]).toBeDefined();
      expect(CONVERSATION_LANGUAGE_LABELS[lang].english.length).toBeGreaterThan(
        0,
      );
      expect(CONVERSATION_LANGUAGE_LABELS[lang].native.length).toBeGreaterThan(
        0,
      );
    }
  });
});

describe('isConversationOnlyLocale', () => {
  it('is false for every UI-shell (SUPPORTED_LANGUAGES) locale', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(isConversationOnlyLocale(lang)).toBe(false);
    }
  });

  it('is true for cs/fr/it — conversation-only locales with no UI translation', () => {
    expect(isConversationOnlyLocale('cs')).toBe(true);
    expect(isConversationOnlyLocale('fr')).toBe(true);
    expect(isConversationOnlyLocale('it')).toBe(true);
  });
});
