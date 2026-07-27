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
import { useProfile } from '../lib/profile';

/**
 * Thrown when no account owner can be resolved from the loaded profile set, so
 * the request cannot be pinned to the owner. Surfaced through the mutation's
 * normal error path — the gate shows its accessible error and retry. We never
 * fall back to the active profile: sending a managed child's id would be both
 * wrong and rejected by the server's anti-spoof check.
 */
export class AdultSelfConsentOwnerUnresolvedError extends Error {
  constructor() {
    super('No account owner profile is available to record consent for.');
    this.name = 'AdultSelfConsentOwnerUnresolvedError';
  }
}

/**
 * [WI-2547] Record the authenticated adult owner's acceptance of their OWN
 * processing + LLM-disclosure consent.
 *
 * Calls ONLY POST /consent/self/accept. This is deliberately not
 * POST /learner-profile/consent, which is mentor-memory consent and a different
 * lawful basis entirely.
 *
 * **The mutation takes no variables and chooses no caller-supplied identifier.**
 * The server derives the write subject from `callerPersonId` — the login→person
 * binding resolved from the verified JWT — plus the authenticated account, a
 * fixed `art6_1_a` lawful basis, and its own `CONSENT_POLICY_VERSION`. Nothing
 * the client sends can retarget the write.
 *
 * **Why this call pins `X-Profile-Id`.** The shared API client normally carries
 * profile context: it injects the persisted ACTIVE profile as `X-Profile-Id` on
 * any request that did not preset one (`lib/api-client.ts`, the
 * `!headers.has('X-Profile-Id')` branch). A guardian can legitimately have a
 * managed child restored as their active profile, so that ambient context would
 * put the CHILD's id on this request. The server treats a header that is not
 * the caller as an anti-spoof failure and returns 403 — which would lock an
 * otherwise eligible adult owner out of the gate permanently.
 *
 * So this mutation presets the header to the already-loaded OWNER identity from
 * ProfileProvider. That is not the client choosing a subject — the server still
 * derives the subject from `callerPersonId` and uses the header only as a
 * consistency check — it is this call refusing to let a restored child
 * selection poison an owner-scoped request.
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
  const { profiles } = useProfile();

  return useMutation({
    mutationFn: async (): Promise<SelfConsentAcceptResult> => {
      const ownerProfileId = profiles.find((p) => p.isOwner)?.id;
      if (!ownerProfileId) {
        // Fail locally rather than send an unpinned request that the ambient
        // active-profile header could aim at a managed child.
        throw new AdultSelfConsentOwnerUnresolvedError();
      }

      const res = await client.consent.self.accept.$post(undefined, {
        headers: { 'X-Profile-Id': ownerProfileId },
      });
      await assertOk(res);
      return await parseJson(res, selfConsentAcceptResultSchema);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
