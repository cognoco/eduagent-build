import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  DashboardChild,
  DashboardData,
  TopicProgress,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useDashboard(): UseQueryResult<DashboardData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', activeProfile?.id],
    queryFn: async ({ signal: querySignal }): Promise<DashboardData> => {
      // Bug #7 fix: combine TanStack Query's cancellation signal with a
      // 10s timeout so the request aborts if the API is unreachable,
      // instead of hanging forever and showing skeletons indefinitely.
      const { signal, cleanup } = combinedSignal(querySignal);

      try {
        const res = await client.dashboard.$get({
          init: { signal },
        } as never);
        await assertOk(res);
        const data = (await res.json()) as DashboardData;

        if (data.children.length === 0) {
          const demoRes = await client.dashboard.demo.$get({
            init: { signal },
          } as never);
          await assertOk(demoRes);
          return (await demoRes.json()) as DashboardData;
        }

        return data;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useChildDetail(
  childProfileId: string | undefined
): UseQueryResult<DashboardChild | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].$get({
          param: { profileId: childProfileId! },
          init: { signal },
        } as never);
        await assertOk(res);
        const data = await res.json();
        return data.child;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!childProfileId,
  });
}

export function useChildSubjectTopics(
  childProfileId: string | undefined,
  subjectId: string | undefined
): UseQueryResult<TopicProgress[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'subject', subjectId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].subjects[
          ':subjectId'
        ].$get({
          param: { profileId: childProfileId!, subjectId: subjectId! },
          init: { signal },
        } as never);
        await assertOk(res);
        const data = await res.json();
        return data.topics;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!childProfileId && !!subjectId,
  });
}

export function useChildSessions(childProfileId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'children', childProfileId, 'sessions'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].sessions.$get(
          {
            param: { profileId: childProfileId! },
            init: { signal },
          } as never
        );
        await assertOk(res);
        const data = await res.json();
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!childProfileId,
  });
}

export function useChildSessionTranscript(
  childProfileId: string | undefined,
  sessionId: string | undefined
) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [
      'dashboard',
      'children',
      childProfileId,
      'sessions',
      sessionId,
      'transcript',
    ],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].sessions[
          ':sessionId'
        ].transcript.$get({
          param: { profileId: childProfileId!, sessionId: sessionId! },
          init: { signal },
        } as never);
        await assertOk(res);
        const data = await res.json();
        return data.transcript;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!childProfileId && !!sessionId,
  });
}
