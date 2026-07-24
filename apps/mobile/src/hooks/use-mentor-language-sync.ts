import { useEffect, useRef } from 'react';
import i18next from 'i18next';
import { conversationLanguageSchema } from '@eduagent/schemas';

import { useProfile } from '../lib/profile';
import {
  beginAutomaticMentorLanguageUpdate,
  shouldSuppressMentorLanguageAutoSync,
} from '../lib/mentor-language-coordination';
import { useUpdateConversationLanguage } from './use-onboarding-dimensions';

type SyncKey = { profileId: string; language: string };

export function useMentorLanguageSync(): void {
  const { activeProfile } = useProfile();
  const { mutate, isPending } = useUpdateConversationLanguage();
  // [BUG-599] Key by (profileId, language) so a profile switch re-runs sync
  // even when the app language hasn't changed.
  const lastSyncedRef = useRef<SyncKey | null>(null);

  useEffect(() => {
    if (!activeProfile || isPending) return;
    let cancelled = false;

    const sync = async () => {
      if (await shouldSuppressMentorLanguageAutoSync(activeProfile.id)) return;
      if (cancelled) return;

      const parsed = conversationLanguageSchema.safeParse(i18next.language);
      if (!parsed.success) return;
      if (parsed.data === activeProfile.conversationLanguage) return;
      const last = lastSyncedRef.current;
      if (
        last &&
        last.profileId === activeProfile.id &&
        last.language === parsed.data
      )
        return;
      // [BUG-800] Set lastSyncedRef only on success, not before the call.
      // Setting it eagerly caused a failed patch to permanently suppress retry
      // for the same (profileId, language) pair until another change occurred.
      const syncKey: SyncKey = {
        profileId: activeProfile.id,
        language: parsed.data,
      };
      const languageOperation = beginAutomaticMentorLanguageUpdate(
        activeProfile.id,
      );
      if (!languageOperation) return;
      mutate(
        { conversationLanguage: parsed.data, languageOperation },
        {
          onSuccess: () => {
            lastSyncedRef.current = syncKey;
          },
        },
      );
    };

    const handleLanguageChanged = () => {
      void sync();
    };

    void sync();
    i18next.on('languageChanged', handleLanguageChanged);
    return () => {
      cancelled = true;
      i18next.off('languageChanged', handleLanguageChanged);
    };
  }, [activeProfile, isPending, mutate]);
}
