import { useMutation } from '@tanstack/react-query';
import type {
  PrepareHomeworkInput,
  PrepareHomeworkOutput,
  GenerateDictationOutput,
  DictationReviewInput,
  DictationReviewResult,
  RecordDictationResultInput as SchemaRecordDictationResultInput,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { createTimeoutSignal } from '../lib/query-timeout';

export type { DictationReviewResult };

export type RecordDictationResultInput = SchemaRecordDictationResultInput;

// [FCR-2026-05-23-L6.L5] Dictation/drill mutation timeout guard.
// Same class as L6.M4 (recall-test hung submission): without a hard timeout,
// a hung API call leaves the dictation playback/review/complete screens stuck
// on "submitting" indefinitely. The default 12s window matches the read-path
// timeout in query-timeout.ts and is plenty for these short JSON submits.
// Mutation throws AbortError on timeout; screens already surface error UIs.
const DICTATION_MUTATION_TIMEOUT_MS = 15_000;

export function usePrepareHomework() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (
      input: PrepareHomeworkInput,
    ): Promise<PrepareHomeworkOutput> => {
      const { signal, cleanup } = createTimeoutSignal(
        DICTATION_MUTATION_TIMEOUT_MS,
      );
      try {
        const res = await client.dictation['prepare-homework'].$post(
          { json: input },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as PrepareHomeworkOutput;
      } finally {
        cleanup();
      }
    },
  });
}

export function useGenerateDictation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<GenerateDictationOutput> => {
      const { signal, cleanup } = createTimeoutSignal(
        DICTATION_MUTATION_TIMEOUT_MS,
      );
      try {
        const res = await client.dictation.generate.$post(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as GenerateDictationOutput;
      } finally {
        cleanup();
      }
    },
  });
}

export function useReviewDictation() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (
      input: DictationReviewInput,
    ): Promise<DictationReviewResult> => {
      const { signal, cleanup } = createTimeoutSignal(
        DICTATION_MUTATION_TIMEOUT_MS,
      );
      try {
        const res = await client.dictation.review.$post(
          { json: input },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as DictationReviewResult;
      } finally {
        cleanup();
      }
    },
  });
}

export function useRecordDictationResult() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: RecordDictationResultInput): Promise<void> => {
      const { signal, cleanup } = createTimeoutSignal(
        DICTATION_MUTATION_TIMEOUT_MS,
      );
      try {
        const res = await client.dictation.result.$post(
          { json: input },
          { init: { signal } },
        );
        await assertOk(res);
      } finally {
        cleanup();
      }
    },
  });
}
