import { useMutation } from '@tanstack/react-query';
import type {
  PrepareHomeworkInput,
  PrepareHomeworkOutput,
  GenerateDictationOutput,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

export function usePrepareHomework() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (
      input: PrepareHomeworkInput
    ): Promise<PrepareHomeworkOutput> => {
      const res = await client.dictation['prepare-homework'].$post({
        json: input,
      });
      await assertOk(res);
      return (await res.json()) as PrepareHomeworkOutput;
    },
  });
}

export function useGenerateDictation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<GenerateDictationOutput> => {
      const res = await client.dictation.generate.$post({});
      await assertOk(res);
      return (await res.json()) as GenerateDictationOutput;
    },
  });
}
