import { useMutation } from '@tanstack/react-query';
import {
  guardianAttachmentInitiationResultSchema,
  type GuardianAttachmentInitiationRequest,
  type GuardianAttachmentInitiationResult,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

export function useGuardianAuthorityInitiation() {
  const client = useApiClient();

  return useMutation<
    GuardianAttachmentInitiationResult,
    Error,
    GuardianAttachmentInitiationRequest
  >({
    retry: false,
    mutationFn: async (input) => {
      const response = await client.consent[
        'guardian-attachment'
      ].initiate.$post({
        json: input,
      });
      await assertOk(response);
      return parseJson(
        response,
        guardianAttachmentInitiationResultSchema,
        'POST /consent/guardian-attachment/initiate',
      );
    },
  });
}
