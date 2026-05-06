import { useEffect } from 'react';
import i18next from 'i18next';
import { conversationLanguageSchema } from '@eduagent/schemas';

import { useProfile } from '../lib/profile';
import { useUpdateConversationLanguage } from './use-onboarding-dimensions';

export function useMentorLanguageSync(): void {
  const { activeProfile } = useProfile();
  const { mutate, isPending } = useUpdateConversationLanguage();

  useEffect(() => {
    if (!activeProfile || isPending) return;

    const sync = () => {
      const parsed = conversationLanguageSchema.safeParse(i18next.language);
      if (!parsed.success) return;
      if (parsed.data === activeProfile.conversationLanguage) return;
      mutate({ conversationLanguage: parsed.data });
    };

    sync();
    i18next.on('languageChanged', sync);
    return () => i18next.off('languageChanged', sync);
  }, [activeProfile, isPending, mutate]);
}
