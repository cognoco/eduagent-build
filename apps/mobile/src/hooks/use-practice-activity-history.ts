// ---------------------------------------------------------------------------
// Practice activity history hook — Journal "My past activity"
//
// Cursor-paginated infinite query over GET /progress/practice-activity-history.
// Spans ALL practice activity types (quiz/review/assessment/dictation/
// recitation/fluency_drill), unlike the quiz-only quiz history view. The
// optional `type` narrows the SERVER query (proper per-type pagination) rather
// than client-filtering a single loaded page — that is why it is part of the
// query key.
// ---------------------------------------------------------------------------

import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type {
  PracticeActivityHistoryResponse,
  ReportPracticeActivityType,
} from '@eduagent/schemas';
import { practiceActivityHistoryResponseSchema } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

export function usePracticeActivityHistory(options?: {
  limit?: number;
  type?: ReportPracticeActivityType;
}): UseInfiniteQueryResult<
  InfiniteData<PracticeActivityHistoryResponse>,
  Error
> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useInfiniteQuery({
    queryKey: ['practice-activity-history', activeProfile?.id, options?.type],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress['practice-activity-history'].$get(
          {
            query: {
              ...(pageParam ? { cursor: pageParam } : {}),
              ...(options?.type ? { type: options.type } : {}),
              ...(options?.limit ? { limit: String(options.limit) } : {}),
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return await parseJson(res, practiceActivityHistoryResponseSchema);
      } finally {
        cleanup();
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!activeProfile,
  });
}
