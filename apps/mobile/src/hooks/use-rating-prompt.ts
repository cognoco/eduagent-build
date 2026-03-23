import { useCallback } from 'react';
import * as StoreReview from 'expo-store-review';
import * as SecureStore from 'expo-secure-store';
import { useProfile } from '../lib/profile';

/** Minimum successful recalls before prompting. */
const MIN_SUCCESSFUL_RECALLS = 5;

/** Minimum days since profile creation. */
const MIN_DAYS_SINCE_CREATION = 7;

/** Minimum days between rating prompts. */
const MIN_DAYS_BETWEEN_PROMPTS = 90;

const RECALL_COUNT_KEY = (profileId: string): string =>
  `rating-recall-success-count:${profileId}`;

const LAST_PROMPT_KEY = (profileId: string): string =>
  `rating-last-prompt:${profileId}`;

/**
 * Hook for prompting App Store rating at psychologically optimal moments.
 *
 * Trigger: after successful recall test (quality >= 3 in SM-2 terms).
 * Conditions: 5+ successful recalls, 7+ days since profile creation,
 * not prompted in 90 days. Only for learner/teen personas.
 *
 * Story 10.18.
 */
export function useRatingPrompt(): {
  /** Call after a successful recall. Increments count and may trigger prompt. */
  onSuccessfulRecall: () => Promise<void>;
} {
  const { activeProfile } = useProfile();

  const onSuccessfulRecall = useCallback(async () => {
    if (!activeProfile) return;

    // Parent profiles excluded
    if (activeProfile.personaType === 'PARENT') return;

    const profileId = activeProfile.id;

    // Increment successful recall count
    const countKey = RECALL_COUNT_KEY(profileId);
    const stored = await SecureStore.getItemAsync(countKey);
    const currentCount = stored ? parseInt(stored, 10) : 0;
    const newCount = currentCount + 1;
    await SecureStore.setItemAsync(countKey, String(newCount));

    // Check minimum recalls
    if (newCount < MIN_SUCCESSFUL_RECALLS) return;

    // Check minimum days since profile creation
    if (activeProfile.createdAt) {
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(activeProfile.createdAt).getTime()) /
          (24 * 60 * 60 * 1000)
      );
      if (daysSinceCreation < MIN_DAYS_SINCE_CREATION) return;
    }

    // Check cooldown between prompts
    const lastPromptKey = LAST_PROMPT_KEY(profileId);
    const lastPromptStr = await SecureStore.getItemAsync(lastPromptKey);
    if (lastPromptStr) {
      const daysSincePrompt = Math.floor(
        (Date.now() - new Date(lastPromptStr).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysSincePrompt < MIN_DAYS_BETWEEN_PROMPTS) return;
    }

    // All conditions met — request review
    const isAvailable = await StoreReview.isAvailableAsync();
    if (isAvailable) {
      await StoreReview.requestReview();
      await SecureStore.setItemAsync(lastPromptKey, new Date().toISOString());
    }
  }, [activeProfile]);

  return { onSuccessfulRecall };
}
