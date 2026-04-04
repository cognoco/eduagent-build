import { useQuery } from '@tanstack/react-query';
import type { LanguageProgress } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useLanguageProgress(subjectId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['language-progress', activeProfile?.id, subjectId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId']['cefr-progress'].$get({
          param: { subjectId },
          init: { signal },
        } as never);
        await assertOk(res);
        return (await res.json()) as LanguageProgress;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}
