import type { UseQueryResult } from '@tanstack/react-query';
import type { BookSuggestionsResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';

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

  return useApiQuery<BookSuggestionsResponse>({
    queryKey: ['book-suggestions', subjectId, activeProfile?.id, topup],
    fetch: (signal) => {
      const sid = subjectId ?? '';
      return topup
        ? client.subjects[':subjectId']['book-suggestions'].topup.$post(
            { param: { subjectId: sid } },
            { init: { signal } },
          )
        : client.subjects[':subjectId']['book-suggestions'].$get(
            { param: { subjectId: sid } },
            { init: { signal } },
          );
    },
    select: (json) => json,
    enabled: !!subjectId,
  });
}
