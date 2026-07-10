import {
  languageProgressSchema,
  type LanguageProgress,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { queryKeys } from '../lib/query-keys';
import { useApiQuery } from './use-api-query';

export function useLanguageProgress(subjectId: string) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<LanguageProgress>({
    queryKey: queryKeys.languageProgress.subject(activeProfile?.id, subjectId),
    schema: languageProgressSchema,
    fetch: (signal) =>
      client.subjects[':subjectId']['cefr-progress'].$get(
        { param: { subjectId } },
        { init: { signal } },
      ),
    select: (json) => json,
    enabled: !!subjectId,
  });
}
