import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export interface TopicSession {
  id: string;
  sessionType: string;
  durationSeconds: number | null;
  createdAt: string;
}

export function useTopicSessions(
  subjectId: string | undefined,
  topicId: string | undefined,
): UseQueryResult<TopicSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['topic-sessions', subjectId, topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !topicId)
        throw new Error('subjectId and topicId required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[
          ':topicId'
        ].sessions.$get(
          { param: { subjectId, topicId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as { sessions: TopicSession[] };
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}
