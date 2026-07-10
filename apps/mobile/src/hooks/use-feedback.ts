import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import {
  feedbackResponseSchema,
  type FeedbackSubmission,
  type FeedbackResponse,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

export function useFeedbackSubmit(): UseMutationResult<
  FeedbackResponse,
  Error,
  FeedbackSubmission
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: FeedbackSubmission) => {
      const res = await client.feedback.$post({ json: input });
      await assertOk(res);
      return await parseJson(res, feedbackResponseSchema);
    },
  });
}
