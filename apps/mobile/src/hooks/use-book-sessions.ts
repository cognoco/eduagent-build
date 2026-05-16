import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { BookSession, GetBookSessionsResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export type { BookSession } from '@eduagent/schemas';

export function useBookSessions(
  subjectId: string | undefined,
  bookId: string | undefined,
): UseQueryResult<BookSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['book-sessions', subjectId, bookId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !bookId)
        throw new Error('subjectId and bookId are required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].books[
          ':bookId'
        ].sessions.$get({ param: { subjectId, bookId } }, { init: { signal } });
        await assertOk(res);
        const data = (await res.json()) as GetBookSessionsResponse;
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!bookId,
  });
}
