import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ConsentRequest,
  ConsentRequestResult,
  ConsentStatus,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';

export function useRequestConsent(): UseMutationResult<
  ConsentRequestResult,
  Error,
  ConsentRequest
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (
      input: ConsentRequest
    ): Promise<ConsentRequestResult> => {
      const res = await client.consent.request.$post({ json: input });
      return await res.json();
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
    queryFn: async (): Promise<ConsentStatusData> => {
      const res = await client.consent['my-status'].$get();
      return await res.json();
    },
  });
}

/**
 * Pure client-side age check for consent requirements.
 * EU: age < 16 requires GDPR consent
 * US: age < 13 requires COPPA consent
 */
export function checkConsentRequirement(
  birthDate: string | null,
  location: string | null
): { required: boolean; consentType: 'GDPR' | 'COPPA' | null } {
  if (!birthDate || !location) {
    return { required: false, consentType: null };
  }

  const age = calculateAge(birthDate);

  if (location === 'EU' && age < 16) {
    return { required: true, consentType: 'GDPR' };
  }
  if (location === 'US' && age < 13) {
    return { required: true, consentType: 'COPPA' };
  }

  return { required: false, consentType: null };
}

function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
