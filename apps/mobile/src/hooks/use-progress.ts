import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  KnowledgeInventory,
  MilestoneRecord,
  MonthlyReportRecord,
  MonthlyReportSummary,
  ProgressHistory,
  SubjectProgress,
  TopicProgress,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

interface ProgressHistoryQuery {
  from?: string;
  to?: string;
  granularity?: 'daily' | 'weekly';
}

export interface NextReviewTopic {
  topicId: string;
  subjectId: string;
  subjectName: string;
  topicTitle: string;
}

export interface ReviewSummary {
  totalOverdue: number;
  nextReviewTopic: NextReviewTopic | null;
  nextUpcomingReviewAt: string | null;
}

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

export function useResumeNudge() {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['resume-nudge', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions['resume-nudge'].$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as {
          nudge: {
            sessionId: string;
            topicHint: string;
            exchangeCount: number;
            createdAt: string;
          } | null;
        };
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveSessionForTopic(topicId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [
      'progress',
      'topic',
      topicId,
      'active-session',
      activeProfile?.id,
    ],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.topic[':topicId'][
          'active-session'
        ].$get({ param: { topicId: topicId ?? '' } }, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as { sessionId: string } | null;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!topicId,
  });
}

// [F-009] Resolve subjectId from topicId — for deep-link resolution
export function useResolveTopicSubject(topicId: string | undefined) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'topic', topicId, 'resolve', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.topics[':topicId'].resolve.$get(
          { param: { topicId: topicId ?? '' } },
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as {
          subjectId: string;
          subjectName: string;
          topicTitle: string;
        };
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!topicId,
  });
}

export function useReviewSummary(): UseQueryResult<ReviewSummary> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'review-summary', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress['review-summary'].$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as ReviewSummary;
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

export function useProgressInventory(): UseQueryResult<KnowledgeInventory> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'inventory', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.inventory.$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as KnowledgeInventory;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useProgressHistory(
  query?: ProgressHistoryQuery
): UseQueryResult<ProgressHistory> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'history', activeProfile?.id, query],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.history.$get(
          {
            query: {
              ...(query?.from ? { from: query.from } : {}),
              ...(query?.to ? { to: query.to } : {}),
              ...(query?.granularity ? { granularity: query.granularity } : {}),
            },
          },
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as ProgressHistory;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useProgressMilestones(
  limit = 5
): UseQueryResult<MilestoneRecord[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'milestones', activeProfile?.id, limit],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.milestones.$get(
          { query: { limit: String(limit) } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { milestones: MilestoneRecord[] };
        return data.milestones;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useRefreshProgressSnapshot(): UseMutationResult<
  unknown,
  Error,
  void
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async () => {
      const res = await client.progress.refresh.$post();
      await assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'inventory', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'history', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'milestones', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['dashboard'],
      });
    },
  });
}

export function useChildInventory(
  childProfileId: string | undefined
): UseQueryResult<KnowledgeInventory | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'inventory'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[
          ':profileId'
        ].inventory.$get(
          { param: { profileId: childProfileId ?? '' } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as {
          inventory: KnowledgeInventory | null;
        };
        return data.inventory;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}

export function useChildProgressHistory(
  childProfileId: string | undefined,
  query?: ProgressHistoryQuery
): UseQueryResult<ProgressHistory | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'history', query],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'][
          'progress-history'
        ].$get(
          {
            param: { profileId: childProfileId ?? '' },
            query: {
              ...(query?.from ? { from: query.from } : {}),
              ...(query?.to ? { to: query.to } : {}),
              ...(query?.granularity ? { granularity: query.granularity } : {}),
            },
          },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { history: ProgressHistory | null };
        return data.history;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}

export function useChildReports(
  childProfileId: string | undefined
): UseQueryResult<MonthlyReportSummary[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'reports'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].reports.$get(
          { param: { profileId: childProfileId ?? '' } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { reports: MonthlyReportSummary[] };
        return data.reports;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}

export function useChildReportDetail(
  childProfileId: string | undefined,
  reportId: string | undefined
): UseQueryResult<MonthlyReportRecord | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'report', reportId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'].reports[
          ':reportId'
        ].$get(
          {
            param: {
              profileId: childProfileId ?? '',
              reportId: reportId ?? '',
            },
          },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as {
          report: MonthlyReportRecord | null;
        };
        return data.report;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      activeProfile.isOwner === true &&
      !!childProfileId &&
      !!reportId,
  });
}

export function useMarkChildReportViewed(): UseMutationResult<
  { viewed: boolean },
  Error,
  { childProfileId: string; reportId: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ childProfileId, reportId }) => {
      const res = await client.dashboard.children[':profileId'].reports[
        ':reportId'
      ].view.$post({
        param: { profileId: childProfileId, reportId },
      });
      await assertOk(res);
      return (await res.json()) as { viewed: boolean };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'child', variables.childProfileId, 'reports'],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'dashboard',
          'child',
          variables.childProfileId,
          'report',
          variables.reportId,
        ],
      });
    },
  });
}
