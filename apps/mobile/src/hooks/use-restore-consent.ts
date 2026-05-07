import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { ConsentActionResult } from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';

export interface RestoreConsentVariables {
  childProfileId: string;
}

export function useRestoreConsent(): UseMutationResult<
  ConsentActionResult,
  Error,
  RestoreConsentVariables
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      childProfileId,
    }: RestoreConsentVariables): Promise<ConsentActionResult> => {
      const res = await client.consent[':childProfileId'].restore.$put({
        param: { childProfileId },
      });
      await assertOk(res);
      return (await res.json()) as ConsentActionResult;
    },
    onSuccess: async () => {
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
