import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import type {
  GetSubjectSessionsResponse,
  SubjectSession,
} from '@eduagent/schemas';

export function useSubjectSessions(
  subjectId: string | undefined
): UseQueryResult<SubjectSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['subject-sessions', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId) throw new Error('subjectId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].sessions.$get(
          { param: { subjectId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as GetSubjectSessionsResponse;
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}
