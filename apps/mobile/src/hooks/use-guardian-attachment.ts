import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  guardianAttachmentResultSchema,
  type GuardianAttachmentRequest,
  type GuardianAttachmentResult,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

export function useGuardianAttachment() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<
    GuardianAttachmentResult,
    Error,
    GuardianAttachmentRequest
  >({
    retry: false,
    mutationFn: async (input) => {
      const response = await client.consent['guardian-attachment'].$post({
        json: input,
      });
      await assertOk(response);
      return parseJson(
        response,
        guardianAttachmentResultSchema,
        'POST /consent/guardian-attachment',
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        predicate: (query) =>
          [
            'profiles',
            'consent-status',
            'country-policy',
            'learning-access',
          ].includes(String(query.queryKey[0])),
      });
    },
  });
}
