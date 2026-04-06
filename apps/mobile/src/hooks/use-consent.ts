import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ConsentRequest,
  ConsentRequestResult,
  ConsentStatus,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useRequestConsent(): UseMutationResult<
  ConsentRequestResult,
  Error,
  ConsentRequest
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: ConsentRequest
    ): Promise<ConsentRequestResult> => {
      const res = await client.consent.request.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as ConsentRequestResult;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = String(query.queryKey[0]);
          return key === 'profiles' || key === 'consent-status';
        },
      });
    },
  });
}

export interface ConsentStatusData {
  consentStatus: ConsentStatus | null;
  parentEmail: string | null;
  consentType: 'GDPR' | 'COPPA' | null;
}

/**
 * Fetches consent status and parentEmail for the active profile.
 *
 * Used by the consent-pending screen to display which email the consent
 * request was sent to, and to get the consentType for the resend mutation.
 */
export function useConsentStatus(): UseQueryResult<ConsentStatusData> {
  const client = useApiClient();

  return useQuery({
    queryKey: ['consent-status'],
    queryFn: async ({ signal: querySignal }): Promise<ConsentStatusData> => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.consent['my-status'].$get({
          init: { signal },
        } as never);
        await assertOk(res);
        return (await res.json()) as ConsentStatusData;
      } finally {
        cleanup();
      }
    },
  });
}

/**
 * Pure client-side age check for consent requirements.
 * Uses the same conservative birth-year rule as the API: if the learner turns
 * 16 at any point in the current calendar year, consent is still required.
 */
export function checkConsentRequirement(birthYear: number | null): {
  required: boolean;
  consentType: 'GDPR' | null;
} {
  if (birthYear == null) {
    return { required: false, consentType: null };
  }

  const age = calculateAge(birthYear);

  if (age <= 16) {
    return { required: true, consentType: 'GDPR' };
  }

  return { required: false, consentType: null };
}

// ---------------------------------------------------------------------------
// Parent-facing child consent hooks (revocation flow)
// ---------------------------------------------------------------------------

export interface ChildConsentData {
  consentStatus: ConsentStatus | null;
  respondedAt: string | null;
  consentType: 'GDPR' | 'COPPA' | null;
}

/**
 * Fetches consent status for a specific child (parent view).
 * Includes `respondedAt` for grace-period countdown calculation.
 */
export function useChildConsentStatus(
  childProfileId: string | undefined
): UseQueryResult<ChildConsentData> {
  const client = useApiClient();

  return useQuery({
    queryKey: ['consent', 'child', childProfileId],
    queryFn: async ({ signal: querySignal }): Promise<ChildConsentData> => {
      if (!childProfileId) {
        throw new Error('childProfileId is required to fetch consent status');
      }
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.consent[':childProfileId'].status.$get({
          param: { childProfileId },
          init: { signal },
        } as never);
        await assertOk(res);
        return (await res.json()) as ChildConsentData;
      } finally {
        cleanup();
      }
    },
    enabled: !!childProfileId,
  });
}

interface RevokeConsentResult {
  message: string;
  consentStatus: ConsentStatus;
}

/**
 * Revokes consent for a child profile (parent-initiated).
 * Invalidates child consent status and dashboard queries on success.
 */
export function useRevokeConsent(
  childProfileId: string | undefined
): UseMutationResult<RevokeConsentResult, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<RevokeConsentResult> => {
      if (!childProfileId) {
        throw new Error('childProfileId is required to revoke consent');
      }
      const res = await client.consent[':childProfileId'].revoke.$put({
        param: { childProfileId },
      });
      await assertOk(res);
      return (await res.json()) as RevokeConsentResult;
    },
    onSuccess: async () => {
      // Consent changes affect all child-related data
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = String(query.queryKey[0]);
          return [
            'consent',
            'consent-status',
            'dashboard',
            'progress',
            'retention',
            'sessions',
            'session-summary',
            'curriculum',
            'interview',
            'assessment',
            'streaks',
            'xp',
            'subjects',
            'settings',
            'subscription',
            'usage',
            'subscription-status',
          ].includes(key);
        },
      });
    },
  });
}

interface RestoreConsentResult {
  message: string;
  consentStatus: ConsentStatus;
}

/**
 * Restores consent for a child profile (cancels revocation).
 * Invalidates child consent status and dashboard queries on success.
 */
export function useRestoreConsent(
  childProfileId: string | undefined
): UseMutationResult<RestoreConsentResult, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<RestoreConsentResult> => {
      if (!childProfileId) {
        throw new Error('childProfileId is required to restore consent');
      }
      const res = await client.consent[':childProfileId'].restore.$put({
        param: { childProfileId },
      });
      await assertOk(res);
      return (await res.json()) as RestoreConsentResult;
    },
    onSuccess: async () => {
      // Consent changes affect all child-related data
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = String(query.queryKey[0]);
          return [
            'consent',
            'consent-status',
            'dashboard',
            'progress',
            'retention',
            'sessions',
            'session-summary',
            'curriculum',
            'interview',
            'assessment',
            'streaks',
            'xp',
            'subjects',
            'settings',
            'subscription',
            'usage',
            'subscription-status',
          ].includes(key);
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}
