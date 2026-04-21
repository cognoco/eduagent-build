// ---------------------------------------------------------------------------
// Onboarding Dimensions Hooks — BKT-C.1 / BKT-C.2
// React Query wrappers for the three profile-wide personalization PATCH
// endpoints introduced with the onboarding-new-dimensions spec. Mirrors the
// existing use-learner-profile.ts hook pattern (self vs. parent-on-behalf).
// ---------------------------------------------------------------------------

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  ConversationLanguage,
  InterestEntry,
  Pronouns,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';

interface UpdateLanguageInput {
  childProfileId?: string;
  conversationLanguage: ConversationLanguage;
}

interface UpdatePronounsInput {
  childProfileId?: string;
  /** null clears the field. */
  pronouns: Pronouns | null;
}

interface UpdateInterestsContextInput {
  childProfileId?: string;
  interests: InterestEntry[];
}

/**
 * Update the active (or a child's) profile's tutor language.
 *
 * Invalidates the cached profile list on success so the language chip on the
 * home screen refreshes. The server defaults to 'en' for existing profiles
 * (migration 0035 backfill) so this only flips the bit to the user's choice.
 */
export function useUpdateConversationLanguage(): UseMutationResult<
  { success: boolean },
  Error,
  UpdateLanguageInput
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client.onboarding[':profileId'].language.$patch({
            param: { profileId: input.childProfileId },
            json: { conversationLanguage: input.conversationLanguage },
          })
        : await client.onboarding.language.$patch({
            json: { conversationLanguage: input.conversationLanguage },
          });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async () => {
      // The tutor-language change takes effect at the next session (per spec
      // non-goal: no mid-session swap). Invalidate the profiles list so any
      // UI chip or Settings row re-renders.
      await qc.invalidateQueries({ queryKey: ['profiles'] });
      if (activeProfile) {
        await qc.invalidateQueries({
          queryKey: ['profile', activeProfile.id],
        });
      }
    },
  });
}

/**
 * Update the active (or a child's) profile's pronouns.
 *
 * Pass `null` to clear. Enforced max 32 chars at the Zod boundary; the UI
 * should surface a specific error on 400 rather than a generic "couldn't
 * save" per the global UX resilience rules.
 */
export function useUpdatePronouns(): UseMutationResult<
  { success: boolean },
  Error,
  UpdatePronounsInput
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client.onboarding[':profileId'].pronouns.$patch({
            param: { profileId: input.childProfileId },
            json: { pronouns: input.pronouns },
          })
        : await client.onboarding.pronouns.$patch({
            json: { pronouns: input.pronouns },
          });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['profiles'] });
      if (activeProfile) {
        await qc.invalidateQueries({
          queryKey: ['profile', activeProfile.id],
        });
      }
    },
  });
}

/**
 * Wholesale-replace interests with context-tagged entries.
 *
 * Called by the per-interest context picker at the end of the onboarding
 * interview. Each interest must have a label (1..60 chars) and a context
 * ('free_time' | 'school' | 'both'). The server bumps learning_profiles
 * version so concurrent analyses retry via the existing optimistic
 * concurrency path.
 */
export function useUpdateInterestsContext(): UseMutationResult<
  { success: boolean },
  Error,
  UpdateInterestsContextInput
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client.onboarding[':profileId'].interests.context.$patch({
            param: { profileId: input.childProfileId },
            json: { interests: input.interests },
          })
        : await client.onboarding.interests.context.$patch({
            json: { interests: input.interests },
          });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      const targetId = vars.childProfileId ?? activeProfile?.id;
      await qc.invalidateQueries({
        queryKey: ['learner-profile', targetId],
      });
    },
  });
}
