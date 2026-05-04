import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LearningSession } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

export function useRetryFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();

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
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      void queryClient.invalidateQueries({
        queryKey: ['session-transcript', sessionId],
      });
    },
  });
}
