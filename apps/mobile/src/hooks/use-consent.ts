import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ConsentRequest,
  ConsentResendRequest,
  ConsentRequestResult,
  ConsentStatus,
} from '@eduagent/schemas';
import {
  consentRequestResultSchema,
  myConsentStatusSchema,
  childConsentStatusSchema,
  consentActionResultSchema,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import { useApiQuery } from './use-api-query';

export function useRequestConsent(): UseMutationResult<
  ConsentRequestResult,
  Error,
  ConsentRequest
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: ConsentRequest,
    ): Promise<ConsentRequestResult> => {
      const res = await client.consent.request.$post({ json: input });
      await assertOk(res);
      return parseJson(
        res,
        consentRequestResultSchema,
        'POST /consent/request',
      );
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

/**
 * [WI-374] Resends the consent email for an EXISTING request. The payload
 * carries NO email — the server reuses the stored recipient — so the masked
 * address shown in the consent-pending UI can never be sent back as the
 * recipient (WI-261), and the resend cap stays bound to the request rather
 * than the recipient string (WI-146/262/309). Recipient changes go through
 * {@link useRequestConsent} (the separately-capped change-recipient path).
 */
export function useResendConsent(): UseMutationResult<
  ConsentRequestResult,
  Error,
  ConsentResendRequest
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: ConsentResendRequest,
    ): Promise<ConsentRequestResult> => {
      const res = await client.consent.resend.$post({ json: input });
      await assertOk(res);
      return parseJson(res, consentRequestResultSchema, 'POST /consent/resend');
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
  // [I-19] Scope the query key to activeProfile so switching child↔owner
  // doesn't flash the previous profile's consent state.
  const { activeProfile } = useProfile();

  return useApiQuery<ConsentStatusData>({
    queryKey: ['consent-status', activeProfile?.id],
    fetch: (signal) =>
      client.consent['my-status'].$get({}, { init: { signal } }),
    select: (json) => myConsentStatusSchema.parse(json),
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
  childProfileId: string | undefined,
): UseQueryResult<ChildConsentData> {
  const client = useApiClient();
  // [BUG-164] Include parent identity (activeProfile?.id) so the same
  // childProfileId fetched under two different parent accounts on a
  // shared device does not collide. The server scopes the response by
  // the requesting parent, so the cache key must mirror that scope.
  const { activeProfile } = useProfile();

  return useApiQuery<ChildConsentData>({
    queryKey: ['consent', 'child', childProfileId, activeProfile?.id],
    fetch: (signal) =>
      client.consent[':childProfileId'].status.$get(
        { param: { childProfileId: childProfileId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => childConsentStatusSchema.parse(json),
    enabled: !!childProfileId && activeProfile?.isOwner === true,
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
  childProfileId: string | undefined,
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
      return parseJson(
        res,
        consentActionResultSchema,
        'PUT /consent/:childProfileId/revoke',
      );
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

// [F-153] useRestoreConsent was duplicated here with an incompatible signature
// (profileId baked in as hook parameter, void mutation variable). The canonical
// version lives in hooks/use-restore-consent.ts and uses the variables-as-arg
// pattern ({ childProfileId } mutation variable). Callers updated to that import.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}
