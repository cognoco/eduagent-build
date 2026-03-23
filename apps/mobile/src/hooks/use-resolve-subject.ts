import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { SubjectResolveResult } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';

export function useResolveSubject(): UseMutationResult<
  SubjectResolveResult,
  Error,
  { rawInput: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: { rawInput: string }) => {
      const res = await client.subjects.resolve.$post({ json: input });
      return (await res.json()) as SubjectResolveResult;
    },
  });
}
