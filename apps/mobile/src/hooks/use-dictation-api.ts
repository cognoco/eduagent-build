import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  PrepareHomeworkInput,
  PrepareHomeworkOutput,
  GenerateDictationOutput,
  DictationReviewInput,
  DictationReviewResult,
  DictationHistory,
  DictationResult,
  RecordDictationResultInput as SchemaRecordDictationResultInput,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';
import { assertOk } from '../lib/assert-ok';
import { createTimeoutSignal } from '../lib/query-timeout';

export type { DictationReviewResult };

export type RecordDictationResultInput = SchemaRecordDictationResultInput;

// [FCR-2026-05-23-L6.L5] Dictation/drill mutation timeout guard.
// Same class as L6.M4 (recall-test hung submission): without a hard timeout,
// a hung API call leaves the dictation playback/review/complete screens stuck
// on "submitting" indefinitely. The 15s window is plenty for these short JSON
// submits. Mutation throws AbortError on timeout; screens already surface
// error UIs.
export const DICTATION_MUTATION_TIMEOUT_MS = 15_000;

// [WI-901] The photo-review call is NOT a short JSON submit — it uploads an
// image and waits on a server-side vision-LLM grading whose provider timeout
// is ~25s. The shared 15s budget aborted the client before a still-valid
// grading returned, and that abort surfaced as a misleading "you're offline"
// error. Give review its own budget comfortably above the server's 25s so the
// client only times out when the server genuinely has.
export const DICTATION_REVIEW_TIMEOUT_MS = 35_000;

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
        DICTATION_REVIEW_TIMEOUT_MS,
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
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

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
    onSuccess: () => {
      // [WI-902] A newly recorded result becomes a history entry — refresh it.
      void queryClient.invalidateQueries({
        queryKey: ['dictation-history', activeProfile?.id],
      });
    },
  });
}

// [WI-902] Recent dictation history (newest first), each entry carrying its
// persisted source sentences. Profile-scoped query key so a profile switch
// never serves another learner's cached history.
export function useDictationHistory(): UseQueryResult<DictationResult[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<DictationHistory, DictationResult[]>({
    queryKey: ['dictation-history', activeProfile?.id],
    fetch: (signal) =>
      client.dictation.history.$get(undefined, { init: { signal } }),
    select: (json) => json.entries,
  });
}
