import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import {
  subjectClassifyResultSchema,
  type SubjectClassifyResult,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

export function useClassifySubject(): UseMutationResult<
  SubjectClassifyResult,
  Error,
  { text: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: { text: string }) => {
      const res = await client.subjects.classify.$post({ json: input });
      await assertOk(res);
      return await parseJson(res, subjectClassifyResultSchema);
    },
  });
}
