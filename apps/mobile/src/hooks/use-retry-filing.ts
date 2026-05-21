import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LearningSession } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';
import { queryKeys } from '../lib/query-keys';

export function useRetryFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  // [BUG-553] profileId is required by matchAnyMode / matchTranscriptAnyMode
  // so invalidation is scoped to the active profile and never crosses account
  // boundaries on a shared device.
  const { activeProfile } = useProfile();

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
      return (await okRes.json()) as { session: LearningSession };
    },
    onSuccess: (_data, { sessionId }) => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchAnyMode(sessionId, activeProfile?.id)(query.queryKey),
      });
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryKeys.sessions.matchTranscriptAnyMode(sessionId, activeProfile?.id)(query.queryKey),
      });
    },
  });
}
