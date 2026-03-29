import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { SubjectClassifyResult } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';

export function useClassifySubject(): UseMutationResult<
  SubjectClassifyResult,
  Error,
  { text: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: { text: string }) => {
      const res = await client.subjects.classify.$post({ json: input });
      return (await res.json()) as SubjectClassifyResult;
    },
  });
}
