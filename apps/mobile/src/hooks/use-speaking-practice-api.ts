import { useMutation } from '@tanstack/react-query';
import type {
  RecordSpeakingPracticeAttemptInput,
  RecordSpeakingPracticeAttemptResponse,
} from '@eduagent/schemas';
import { recordSpeakingPracticeAttemptResponseSchema } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import { createTimeoutSignal } from '../lib/query-timeout';

// WI-1777: records a repeat-after-me/shadowing attempt. Short JSON submit —
// same 15s mutation-timeout budget as dictation's result submission
// (use-dictation-api.ts).
export const SPEAKING_PRACTICE_MUTATION_TIMEOUT_MS = 15_000;

export function useRecordSpeakingPracticeAttempt() {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (
      input: RecordSpeakingPracticeAttemptInput,
    ): Promise<RecordSpeakingPracticeAttemptResponse> => {
      const { signal, cleanup } = createTimeoutSignal(
        SPEAKING_PRACTICE_MUTATION_TIMEOUT_MS,
      );
      try {
        const res = await client.language['speaking-practice'].attempts.$post(
          { json: input },
          { init: { signal } },
        );
        await assertOk(res);
        return parseJson(
          res,
          recordSpeakingPracticeAttemptResponseSchema,
          'POST /language/speaking-practice/attempts',
        );
      } finally {
        cleanup();
      }
    },
  });
}
