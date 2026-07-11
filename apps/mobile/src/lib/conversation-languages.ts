// WI-1496 — display metadata for the 10-locale conversationLanguageSchema
// (the tutor-prose language set), as distinct from the 7-locale
// SUPPORTED_LANGUAGES UI-shell set (see AGENTS.md "Languages"). Language
// endonyms are proper nouns and intentionally not routed through t() — same
// convention as i18n/index.ts's LANGUAGE_LABELS.
import {
  conversationLanguageSchema,
  type ConversationLanguage,
} from '@eduagent/schemas';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from '../i18n';

export const CONVERSATION_LANGUAGES: readonly ConversationLanguage[] =
  conversationLanguageSchema.options;

export const CONVERSATION_LANGUAGE_LABELS: Record<
  ConversationLanguage,
  { english: string; native: string }
> = {
  ...LANGUAGE_LABELS,
  cs: { english: 'Czech', native: 'Čeština' },
  fr: { english: 'French', native: 'Français' },
  it: { english: 'Italian', native: 'Italiano' },
};

// True for a conversationLanguageSchema locale that has no UI-shell
// translation (cs/fr/it as of this writing) — the tutor speaks it, but app
// menus stay in English. Used to surface expectation-setting copy in the
// picker.
export function isConversationOnlyLocale(lang: ConversationLanguage): boolean {
  return !(SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}
