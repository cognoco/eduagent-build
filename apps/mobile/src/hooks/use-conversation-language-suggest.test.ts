import {
  shouldShowSuggestion,
  type SuggestionInput,
} from './use-conversation-language-suggest';

describe('shouldShowSuggestion', () => {
  const base: SuggestionInput = {
    profileExists: true,
    conversationLanguage: 'en',
    uiLanguage: 'de',
    supportedConversationLanguages: [
      'en',
      'cs',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'pl',
    ],
    dismissed: false,
  };

  it('returns true when all conditions are met', () => {
    expect(shouldShowSuggestion(base)).toBe(true);
  });

  it('returns false when profile does not exist', () => {
    expect(shouldShowSuggestion({ ...base, profileExists: false })).toBe(false);
  });

  it('returns false when UI language matches conversationLanguage', () => {
    expect(shouldShowSuggestion({ ...base, uiLanguage: 'en' })).toBe(false);
  });

  it('returns false when UI language is not in ConversationLanguage enum', () => {
    expect(shouldShowSuggestion({ ...base, uiLanguage: 'nb' })).toBe(false);
  });

  it('returns false when already dismissed', () => {
    expect(shouldShowSuggestion({ ...base, dismissed: true })).toBe(false);
  });

  it('returns false when UI language is ja (not in ConversationLanguage enum)', () => {
    expect(shouldShowSuggestion({ ...base, uiLanguage: 'ja' })).toBe(false);
  });
});
