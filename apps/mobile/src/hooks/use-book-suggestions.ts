import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { BookSuggestionsResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// [WI-258] Top-up generation was split from the GET endpoint into a
// dedicated POST /subjects/:subjectId/book-suggestions/topup so the
// path-based metering allowlist can correctly bill the side-effecting
// branch without billing the DB-only read. When `options.topup === true`
// the hook now issues a POST to the topup route; otherwise it issues the
// plain GET. The response shape is identical.
export function useBookSuggestions(
  subjectId: string | undefined,
  options?: { topup?: boolean },
): UseQueryResult<BookSuggestionsResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const topup = options?.topup ?? false;

  return useQuery({
    queryKey: ['book-suggestions', subjectId, activeProfile?.id, topup],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId) throw new Error('subjectId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = topup
          ? await client.subjects[':subjectId']['book-suggestions'].topup.$post(
              { param: { subjectId } },
              { init: { signal } },
            )
          : await client.subjects[':subjectId']['book-suggestions'].$get(
              { param: { subjectId } },
              { init: { signal } },
            );
        await assertOk(res);
        return (await res.json()) as BookSuggestionsResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}
