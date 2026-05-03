// NOT YET CONSUMED. Wired up by docs/superpowers/plans/2026-05-03-llm-powered-i18n.md
// when FEATURE_FLAGS.I18N_ENABLED flips to true. Until then, the hook is dormant
// (the I18N_ENABLED guard in `show` returns false) and no screen renders it.
// Do NOT delete — see CLAUDE.md "Comment out, don't delete unreleased UI features".

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next, { LANGUAGE_LABELS, type SupportedLanguage } from '../i18n';
import { useProfile } from '../lib/profile';
import { useUpdateConversationLanguage } from './use-onboarding-dimensions';
import {
  conversationLanguageSchema,
  type ConversationLanguage,
} from '@eduagent/schemas';
import { FEATURE_FLAGS } from '../lib/feature-flags';

const DISMISS_KEY = 'i18n-auto-suggest-dismissed';

export interface SuggestionInput {
  profileExists: boolean;
  conversationLanguage: string;
  uiLanguage: string;
  supportedConversationLanguages: readonly string[];
  dismissed: boolean;
}

export function shouldShowSuggestion(input: SuggestionInput): boolean {
  if (!input.profileExists) return false;
  if (input.uiLanguage === input.conversationLanguage) return false;
  if (!input.supportedConversationLanguages.includes(input.uiLanguage))
    return false;
  if (input.dismissed) return false;
  return true;
}

export function useConversationLanguageSuggest(): {
  visible: boolean;
  suggestedLanguage: string;
  suggestedLanguageLabel: string;
  accept: () => void;
  dismiss: () => void;
} {
  const { activeProfile } = useProfile();
  const updateLanguage = useUpdateConversationLanguage();
  const [dismissed, setDismissed] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!FEATURE_FLAGS.I18N_ENABLED) return;
    AsyncStorage.getItem(DISMISS_KEY).then((val) => {
      setDismissed(val === 'true');
      setChecked(true);
    });
  }, []);

  const uiLanguage = i18next.language;
  const conversationLanguage = activeProfile?.conversationLanguage ?? 'en';
  const conversationLanguages = conversationLanguageSchema.options;

  const show =
    FEATURE_FLAGS.I18N_ENABLED &&
    checked &&
    shouldShowSuggestion({
      profileExists: !!activeProfile,
      conversationLanguage,
      uiLanguage,
      supportedConversationLanguages: conversationLanguages,
      dismissed,
    });

  const accept = useCallback(() => {
    const lang = uiLanguage as ConversationLanguage;
    updateLanguage.mutate({ conversationLanguage: lang });
    AsyncStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }, [uiLanguage, updateLanguage]);

  const dismiss = useCallback(() => {
    AsyncStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }, []);

  const label =
    LANGUAGE_LABELS[uiLanguage as SupportedLanguage]?.english ?? uiLanguage;

  return {
    visible: show,
    suggestedLanguage: uiLanguage,
    suggestedLanguageLabel: label,
    accept,
    dismiss,
  };
}
