import { type UseQueryResult } from '@tanstack/react-query';
import type { BookSession, GetBookSessionsResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { queryKeys } from '../lib/query-keys';
import { LEARNING_ENTRY_QUERY_TIMEOUT_MS } from '../lib/query-timeout';
import { useApiQuery } from './use-api-query';

export type { BookSession } from '@eduagent/schemas';

export function useBookSessions(
  subjectId: string | undefined,
  bookId: string | undefined,
): UseQueryResult<BookSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<GetBookSessionsResponse, BookSession[]>({
    queryKey: queryKeys.bookSessions(subjectId, bookId, activeProfile?.id),
    enabled: !!subjectId && !!bookId,
    timeoutMs: LEARNING_ENTRY_QUERY_TIMEOUT_MS,
    fetch: (signal) => {
      if (!subjectId || !bookId)
        throw new Error('subjectId and bookId are required');
      return client.subjects[':subjectId'].books[':bookId'].sessions.$get(
        { param: { subjectId, bookId } },
        { init: { signal } },
      );
    },
    select: (data) => data.sessions,
  });
}
