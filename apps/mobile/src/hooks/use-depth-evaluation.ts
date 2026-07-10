import { useMutation } from '@tanstack/react-query';
import { depthEvaluationSchema } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

export function useDepthEvaluation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const res = await client.sessions[':sessionId']['evaluate-depth'].$post({
        param: { sessionId },
      });
      await assertOk(res);
      return await parseJson(res, depthEvaluationSchema);
    },
  });
}
