import { type UseQueryResult } from '@tanstack/react-query';
import type {
  GetSubjectSessionsResponse,
  SubjectSession,
} from '@eduagent/schemas';
import { getSubjectSessionsResponseSchema } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { queryKeys } from '../lib/query-keys';
import { useApiQuery } from './use-api-query';

export function useSubjectSessions(
  subjectId: string | undefined,
): UseQueryResult<SubjectSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<GetSubjectSessionsResponse, SubjectSession[]>({
    queryKey: queryKeys.subjectSessions(subjectId, activeProfile?.id),
    enabled: !!subjectId,
    schema: getSubjectSessionsResponseSchema,
    fetch: (signal) => {
      if (!subjectId) throw new Error('subjectId is required');
      return client.subjects[':subjectId'].sessions.$get(
        { param: { subjectId } },
        { init: { signal } },
      );
    },
    select: (data) => data.sessions,
  });
}
