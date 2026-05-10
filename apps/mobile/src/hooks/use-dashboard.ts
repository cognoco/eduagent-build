import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CuratedMemoryView,
  DashboardChild,
  DashboardData,
  TopicProgress,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// Mirror of api/services/dashboard.ts:ChildSession used by the
// `/dashboard/children/:profileId/sessions/:sessionId` route response. Hono's
// `InferResponseType` collapses to `{}` for this chain, so we pin the shape
// here. Keep this in sync with the api ChildSession interface — drift would
// surface as missing-property errors in `child/[profileId]/session/[sessionId].tsx`.
interface ChildSessionDetail {
  sessionId: string;
  subjectId: string;
  subjectName: string | null;
  topicId: string | null;
  topicTitle: string | null;
  sessionType: string;
  startedAt: string;
  endedAt: string | null;
  exchangeCount: number;
  escalationRung: number;
  durationSeconds: number | null;
  wallClockSeconds: number | null;
  displayTitle: string;
  displaySummary: string | null;
  homeworkSummary: { summary: string } | null;
  highlight: string | null;
  narrative: string | null;
  conversationPrompt: string | null;
  engagementSignal:
    | 'curious'
    | 'stuck'
    | 'breezing'
    | 'focused'
    | 'scattered'
    | null;
}

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
        const res = await client.dashboard.$get({}, { init: { signal } });
        await assertOk(res);
        const data = (await res.json()) as DashboardData;

        if (data.children.length === 0) {
          const demoRes = await client.dashboard.demo.$get(
            {},
            { init: { signal } },
          );
          await assertOk(demoRes);
          return (await demoRes.json()) as DashboardData;
        }

        return data;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    // [BUG-738 / PERF-8] Dashboard aggregate is heavy (children + sessions +
    // metrics joins). The previous 60s timer hammered the API on every parent
    // who left the dashboard tab open, regardless of focus. Tune to: stale
    // after 2 minutes, background refetch every 5 minutes, and skip refetch
    // when the app is backgrounded so the timer pauses off-tab. Window-focus
    // refetch is unchanged for snappy "I just came back" UX.
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useAckNotice(): UseMutationResult<
  { seen: true },
  Error,
  { id: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client.notices[':id'].seen.$post({
        param: { id },
      });
      await assertOk(res);
      return (await res.json()) as { seen: true };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', activeProfile?.id],
      });
    },
  });
}

export function useChildDetail(
  childProfileId: string | undefined,
): UseQueryResult<DashboardChild | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId],
    queryFn: async ({ signal: querySignal }) => {
      if (!childProfileId) throw new Error('childProfileId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].$get(
          { param: { profileId: childProfileId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.child;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}

export function useChildSubjectTopics(
  childProfileId: string | undefined,
  subjectId: string | undefined,
): UseQueryResult<TopicProgress[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'subject', subjectId],
    queryFn: async ({ signal: querySignal }) => {
      if (!childProfileId) throw new Error('childProfileId is required');
      if (!subjectId) throw new Error('subjectId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].subjects[
          ':subjectId'
        ].$get(
          { param: { profileId: childProfileId, subjectId: subjectId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.topics;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      activeProfile.isOwner === true &&
      !!childProfileId &&
      !!subjectId,
  });
}

export function useChildSessions(childProfileId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'children', childProfileId, 'sessions'],
    queryFn: async ({ signal: querySignal }) => {
      if (!childProfileId) throw new Error('childProfileId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].sessions.$get(
          { param: { profileId: childProfileId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}

export function useChildSessionDetail(
  childProfileId: string | undefined,
  sessionId: string | undefined,
) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'children', childProfileId, 'session', sessionId],
    queryFn: async ({ signal: querySignal }) => {
      if (!childProfileId) throw new Error('childProfileId is required');
      if (!sessionId) throw new Error('sessionId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].sessions[
          ':sessionId'
        ].$get(
          {
            param: {
              profileId: childProfileId,
              sessionId,
            },
          },
          { init: { signal } },
        );
        if (res.status === 404) return null;
        await assertOk(res);
        const data = (await res.json()) as { session: ChildSessionDetail };
        return data.session;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      activeProfile.isOwner === true &&
      !!childProfileId &&
      !!sessionId,
  });
}

export function useChildMemory(childProfileId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'children', childProfileId, 'memory'],
    queryFn: async ({ signal: querySignal }) => {
      if (!childProfileId) throw new Error('childProfileId is required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].memory.$get(
          { param: { profileId: childProfileId } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.memory as CuratedMemoryView;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}
