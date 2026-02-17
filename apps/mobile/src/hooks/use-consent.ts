import { useMutation } from '@tanstack/react-query';
import { useApi } from '../lib/auth-api';

interface ConsentRequestInput {
  childProfileId: string;
  parentEmail: string;
  consentType: 'GDPR' | 'COPPA';
}

interface ConsentRequestResult {
  message: string;
  consentType: string;
}

export function useRequestConsent() {
  const { post } = useApi();

  return useMutation({
    mutationFn: async (
      input: ConsentRequestInput
    ): Promise<ConsentRequestResult> => {
      return post<ConsentRequestResult>('/consent/request', input);
    },
  });
}

/**
 * Pure client-side age check for consent requirements.
 * EU: age < 16 requires GDPR consent
 * US: age < 13 requires COPPA consent
 */
export function useConsentCheck(
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
