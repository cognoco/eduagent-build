import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SubjectProgress, TopicProgress } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useSubjectProgress(
  subjectId: string
): UseQueryResult<SubjectProgress> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'subject', subjectId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].progress.$get(
          { param: { subjectId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { progress: SubjectProgress };
        return data.progress;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useOverallProgress() {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'overview', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.overview.$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        return await res.json();
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useContinueSuggestion() {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'continue', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.continue.$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        const data = await res.json();
        return data.suggestion;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useTopicProgress(
  subjectId: string,
  topicId: string
): UseQueryResult<TopicProgress> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'topic', subjectId, topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[
          ':topicId'
        ].progress.$get(
          { param: { subjectId, topicId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { topic: TopicProgress };
        return data.topic;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}
