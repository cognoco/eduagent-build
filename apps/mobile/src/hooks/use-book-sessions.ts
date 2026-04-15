import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export interface BookSession {
  id: string;
  topicId: string | null;
  topicTitle: string;
  chapter: string | null;
  createdAt: string;
}

interface BookSessionsResponse {
  sessions: BookSession[];
}

export function useBookSessions(
  subjectId: string | undefined,
  bookId: string | undefined
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
        const data = (await res.json()) as BookSessionsResponse;
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!bookId,
  });
}
