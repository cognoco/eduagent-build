import { useMutation } from '@tanstack/react-query';
import type {
  PrepareHomeworkInput,
  PrepareHomeworkOutput,
  GenerateDictationOutput,
  DictationMode,
  DictationReviewInput,
  DictationReviewResult,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

export type { DictationReviewResult };

export interface RecordDictationResultInput {
  localDate: string;
  sentenceCount: number;
  mistakeCount: number | null;
  mode: DictationMode;
  reviewed: boolean;
}

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

export function useReviewDictation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (
      input: DictationReviewInput
    ): Promise<DictationReviewResult> => {
      const res = await client.dictation.review.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as DictationReviewResult;
    },
  });
}

export function useRecordDictationResult() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: RecordDictationResultInput): Promise<void> => {
      const res = await client.dictation.result.$post({ json: input });
      await assertOk(res);
    },
  });
}
