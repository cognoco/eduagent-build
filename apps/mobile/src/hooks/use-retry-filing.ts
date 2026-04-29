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
      const retryFilingClient = (
        client.sessions[':sessionId'] as unknown as {
          'retry-filing': {
            $post: (args: {
              param: { sessionId: string };
            }) => Promise<Response>;
          };
        }
      )['retry-filing'];
      const res = await retryFilingClient.$post({
        param: { sessionId },
      });
      await assertOk(res);
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
