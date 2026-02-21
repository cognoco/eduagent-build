import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  DashboardChild,
  DashboardData,
  TopicProgress,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

export function useDashboard(): UseQueryResult<DashboardData> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', activeProfile?.id],
    queryFn: async (): Promise<DashboardData> => {
      const res = await client.dashboard.$get();
      const data = (await res.json()) as DashboardData;

      if (data.children.length === 0) {
        const demoRes = await client.dashboard.demo.$get();
        return (await demoRes.json()) as DashboardData;
      }

      return data;
    },
    enabled: !!activeProfile,
  });
}

export function useChildDetail(
  childProfileId: string | undefined
): UseQueryResult<DashboardChild | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId],
    queryFn: async () => {
      const res = await client.dashboard.children[':profileId'].$get({
        param: { profileId: childProfileId! },
      });
      const data = await res.json();
      return data.child;
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
    queryFn: async () => {
      const res = await client.dashboard.children[':profileId'].subjects[
        ':subjectId'
      ].$get({
        param: { profileId: childProfileId!, subjectId: subjectId! },
      });
      const data = await res.json();
      return data.topics;
    },
    enabled: !!activeProfile && !!childProfileId && !!subjectId,
  });
}

export function useChildSessions(childProfileId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'children', childProfileId, 'sessions'],
    queryFn: async () => {
      const res = await client.dashboard.children[':profileId'].sessions.$get({
        param: { profileId: childProfileId! },
      });
      const data = await res.json();
      return data.sessions;
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
    queryFn: async () => {
      const res = await client.dashboard.children[':profileId'].sessions[
        ':sessionId'
      ].transcript.$get({
        param: { profileId: childProfileId!, sessionId: sessionId! },
      });
      const data = await res.json();
      return data.transcript;
    },
    enabled: !!activeProfile && !!childProfileId && !!sessionId,
  });
}
