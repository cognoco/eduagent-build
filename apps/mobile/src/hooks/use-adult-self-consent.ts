import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  selfConsentAcceptResultSchema,
  type SelfConsentAcceptResult,
} from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { parseJson } from '../lib/parse-json';

/**
 * [WI-2547] Record the authenticated adult owner's acceptance of their OWN
 * processing + LLM-disclosure consent.
 *
 * Calls ONLY POST /consent/self/accept. This is deliberately not
 * POST /learner-profile/consent, which is mentor-memory consent and a different
 * lawful basis entirely.
 *
 * Takes no variables: the server derives the person from the verified login
 * binding, the organization from the authenticated account, the lawful basis,
 * and the terms version. There is nothing for the client to supply — and
 * nothing it could supply to retarget the write.
 *
 * On success the user-scoped `profiles` query is invalidated so the bootstrap
 * re-runs and `needsAdultConsent` can settle to false. (Mounting the gate on
 * that signal is WI-2411's boundary, not this hook's.)
 */
export function useAdultSelfConsent(): UseMutationResult<
  SelfConsentAcceptResult,
  Error,
  void
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<SelfConsentAcceptResult> => {
      const res = await client.consent.self.accept.$post();
      await assertOk(res);
      return await parseJson(res, selfConsentAcceptResultSchema);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
