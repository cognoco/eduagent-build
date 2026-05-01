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
      await assertOk(res);
      // assertOk throws on non-2xx but is typed `Promise<void>`, not an
      // `asserts` predicate, so TS cannot narrow the RPC response union here.
      // The cast pins the success-shape and matches the function return type.
      return (await res.json()) as { session: LearningSession };
    },
    onSuccess: (_data, { sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      void queryClient.invalidateQueries({
        queryKey: ['session-transcript', sessionId],
      });
    },
  });
}
