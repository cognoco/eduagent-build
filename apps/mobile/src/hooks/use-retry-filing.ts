import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  learningSessionResponseSchema,
  type LearningSession,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import { queryKeys } from '../lib/query-keys';
import { useNavigationDataScopeContract } from './use-navigation-contract';

export function useRetryFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  // [BUG-553] profileId is required by matchAnyMode / matchTranscriptAnyMode
  // so invalidation is scoped to the active profile and never crosses account
  // boundaries on a shared device.
  const { queryScope } = useNavigationDataScopeContract();
  const profileId = queryScope.profileId ?? undefined;

  return useMutation({
    mutationFn: async ({
      sessionId,
    }: {
      sessionId: string;
    }): Promise<{ session: LearningSession }> => {
      const res = await client.sessions[':sessionId']['retry-filing'].$post({
        param: { sessionId },
      });
      // [BUG-982] assertOk now returns the response narrowed to the success
      // branch (T & { ok: true }). The cast pins the success-body shape:
      // Hono RPC ClientResponse has multiple success-status members, so the
      // union still resolves to a wider type than the function signature.
      const okRes = await assertOk(res);
      return await parseJson(okRes, learningSessionResponseSchema);
    },
    onSuccess: (_data, { sessionId }) => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchAnyMode(sessionId, profileId)(query.queryKey),
      });
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchTranscriptAnyMode(
            sessionId,
            profileId,
          )(query.queryKey),
      });
    },
  });
}
