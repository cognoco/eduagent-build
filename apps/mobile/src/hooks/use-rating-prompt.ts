import { useCallback, useEffect, useRef } from 'react';
import * as StoreReview from 'expo-store-review';
import * as SecureStore from '../lib/secure-storage';
import { computeAgeBracket } from '@eduagent/schemas';
import { useProfile } from '../lib/profile';
import { migrateSecureStoreKey } from '../lib/migrate-secure-store-key';

/** Minimum successful recalls before prompting. */
const MIN_SUCCESSFUL_RECALLS = 5;

/** Minimum days since profile creation. */
const MIN_DAYS_SINCE_CREATION = 7;

/** Minimum days between rating prompts. */
const MIN_DAYS_BETWEEN_PROMPTS = 90;

// Keys renamed from colon to dash delimiters — colons caused SecureStore
// crashes on some Android devices. See migrate-secure-store-key.ts.
const RECALL_COUNT_KEY = (profileId: string): string =>
  `rating-recall-success-count-${profileId}`;

const LAST_PROMPT_KEY = (profileId: string): string =>
  `rating-last-prompt-${profileId}`;

/** @deprecated Old colon-delimited keys — used only for migration. */
const LEGACY_RECALL_COUNT_KEY = (profileId: string): string =>
  `rating-recall-success-count:${profileId}`;
const LEGACY_LAST_PROMPT_KEY = (profileId: string): string =>
  `rating-last-prompt:${profileId}`;

/**
 * Hook for prompting App Store rating at psychologically optimal moments.
 *
 * Trigger: after successful recall test (quality >= 3 in SM-2 terms).
 * Conditions: 5+ successful recalls, 7+ days since profile creation,
 * not prompted in 90 days. Adult profiles are excluded.
 *
 * Story 10.18.
 */
export function useRatingPrompt(): {
  /** Call after a successful recall. Increments count and may trigger prompt. */
  onSuccessfulRecall: () => Promise<void>;
} {
  const { activeProfile } = useProfile();
  const migrated = useRef(false);

  // One-time migration from old colon-delimited SecureStore keys
  useEffect(() => {
    if (!activeProfile || migrated.current) return;
    migrated.current = true;
    const id = activeProfile.id;
    void migrateSecureStoreKey(
      LEGACY_RECALL_COUNT_KEY(id),
      RECALL_COUNT_KEY(id),
    );
    void migrateSecureStoreKey(LEGACY_LAST_PROMPT_KEY(id), LAST_PROMPT_KEY(id));
  }, [activeProfile]);

  const onSuccessfulRecall = useCallback(async () => {
    if (!activeProfile) return;

    // [BUG-680 / I-14] activeProfile.birthYear is typed `number | null`.
    // Passing null to computeAgeBracket(birthYear: number) silently returns
    // `year - null = year` → 'adult', masking unknown-age users as adults
    // and skipping the prompt for the wrong reason. If we don't know the
    // age, we should NOT prompt — same outcome but with explicit intent.
    if (
      activeProfile.birthYear == null ||
      computeAgeBracket(activeProfile.birthYear) === 'adult'
    )
      return;

    try {
      const profileId = activeProfile.id;

      // Increment successful recall count
      const countKey = RECALL_COUNT_KEY(profileId);
      const stored = await SecureStore.getItemAsync(countKey);
      const parsed = stored ? parseInt(stored, 10) : 0;
      const currentCount = Number.isNaN(parsed) ? 0 : parsed;
      const newCount = currentCount + 1;
      await SecureStore.setItemAsync(countKey, String(newCount));

      // Check minimum recalls
      if (newCount < MIN_SUCCESSFUL_RECALLS) return;

      // Check minimum days since profile creation
      if (activeProfile.createdAt) {
        const daysSinceCreation = Math.floor(
          (Date.now() - new Date(activeProfile.createdAt).getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (daysSinceCreation < MIN_DAYS_SINCE_CREATION) return;
      }

      // Check cooldown between prompts
      const lastPromptKey = LAST_PROMPT_KEY(profileId);
      const lastPromptStr = await SecureStore.getItemAsync(lastPromptKey);
      if (lastPromptStr) {
        const daysSincePrompt = Math.floor(
          (Date.now() - new Date(lastPromptStr).getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (daysSincePrompt < MIN_DAYS_BETWEEN_PROMPTS) return;
      }

      // All conditions met — request review
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
        await SecureStore.setItemAsync(lastPromptKey, new Date().toISOString());
      }
    } catch (error) {
      // SecureStore may be unavailable in some environments — skip rating prompt.
      // Log for prod observability [SC-4]
      console.error('[RatingPrompt] check failed:', error);
    }
  }, [activeProfile]);

  return { onSuccessfulRecall };
}
