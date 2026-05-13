import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  KnowledgeInventory,
  LearningResumeScope,
  LearningResumeTarget,
  MilestoneRecord,
  MonthlyReportRecord,
  MonthlyReportSummary,
  OverdueSubject,
  OverdueTopic,
  OverdueTopicsResponse,
  ProgressSummary,
  ProgressHistory,
  ChildSession,
  SubjectProgress,
  TopicProgress,
  WeeklyReportRecord,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import {
  childReportDetailResponseSchema,
  childReportsResponseSchema,
  childSessionsResponseSchema,
  progressSummarySchema,
  weeklyReportDetailResponseSchema,
  weeklyReportsResponseSchema,
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

export type { OverdueTopic, OverdueSubject, OverdueTopicsResponse };

export function useSubjectProgress(
  subjectId: string,
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
          { init: { signal } },
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

export interface OverallProgressResponse {
  subjects: {
    subjectId: string;
    name: string;
    topicsTotal: number;
    topicsCompleted: number;
    topicsVerified: number;
    urgencyScore: number;
    retentionStatus: 'strong' | 'fading' | 'weak' | 'forgotten';
    lastSessionAt: string | null;
  }[];
  totalTopicsCompleted: number;
  totalTopicsVerified: number;
}

export function useOverallProgress(): UseQueryResult<OverallProgressResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery<OverallProgressResponse>({
    queryKey: ['progress', 'overview', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.overview.$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as OverallProgressResponse;
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
          { init: { signal } },
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

export async function fetchLearningResumeTarget(
  client: ReturnType<typeof useApiClient>,
  scope: LearningResumeScope = {},
  signal?: AbortSignal,
): Promise<LearningResumeTarget | null> {
  const query = Object.fromEntries(
    Object.entries(scope).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  );
  const resumeTargetClient = (
    client.progress as unknown as {
      'resume-target': {
        $get: (
          args: { query: Record<string, string> },
          options?: { init?: RequestInit },
        ) => Promise<Response>;
      };
    }
  )['resume-target'];
  const res = await resumeTargetClient.$get(
    { query },
    { init: signal ? { signal } : undefined },
  );
  await assertOk(res);
  const data = (await res.json()) as { target: LearningResumeTarget | null };
  return data.target;
}

export function useLearningResumeTarget(
  scope: LearningResumeScope = {},
): UseQueryResult<LearningResumeTarget | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [
      'progress',
      'resume-target',
      activeProfile?.id,
      scope.subjectId ?? null,
      scope.bookId ?? null,
      scope.topicId ?? null,
    ],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        return await fetchLearningResumeTarget(client, scope, signal);
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    staleTime: 60 * 1000,
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
          { init: { signal } },
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
          { init: { signal } },
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
          { init: { signal } },
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

export function useOverdueTopics(): UseQueryResult<OverdueTopicsResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'overdue-topics', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress['overdue-topics'].$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as OverdueTopicsResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useTopicProgress(
  subjectId: string,
  topicId: string,
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
          { init: { signal } },
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
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as KnowledgeInventory;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    // [BUG-503] Prevent refetch storm: inventory doesn't change within a visit.
    staleTime: 2 * 60 * 1000,
  });
}

export function useProgressHistory(
  query?: ProgressHistoryQuery,
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
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as ProgressHistory;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    // [BUG-503] History data is weekly; no need to refetch within the same visit.
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgressMilestones(
  limit = 5,
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
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as { milestones: MilestoneRecord[] };
        return data.milestones;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    // [BUG-503] Milestones don't change mid-session.
    staleTime: 2 * 60 * 1000,
  });
}

export function useProfileSessions(
  profileId: string | undefined,
): UseQueryResult<ChildSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'profile', profileId, 'sessions', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const isActiveProfile = profileId === activeProfile?.id;
        const res = isActiveProfile
          ? await client.progress.sessions.$get({}, { init: { signal } })
          : await client.dashboard.children[':profileId'].sessions.$get(
              { param: { profileId: profileId ?? '' } },
              { init: { signal } },
            );
        await assertOk(res);
        const data = childSessionsResponseSchema.parse(await res.json());
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      !!profileId &&
      (profileId === activeProfile.id || activeProfile.isOwner === true),
  });
}

export function useProfileReports(
  profileId: string | undefined,
): UseQueryResult<MonthlyReportSummary[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'profile', profileId, 'reports', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const isActiveProfile = profileId === activeProfile?.id;
        const res = isActiveProfile
          ? await client.progress.reports.$get({}, { init: { signal } })
          : await client.dashboard.children[':profileId'].reports.$get(
              { param: { profileId: profileId ?? '' } },
              { init: { signal } },
            );
        await assertOk(res);
        const data = childReportsResponseSchema.parse(await res.json());
        return data.reports;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      !!profileId &&
      (profileId === activeProfile.id || activeProfile.isOwner === true),
  });
}

export function useProfileWeeklyReports(
  profileId: string | undefined,
): UseQueryResult<WeeklyReportSummary[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [
      'progress',
      'profile',
      profileId,
      'weekly-reports',
      activeProfile?.id,
    ],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const isActiveProfile = profileId === activeProfile?.id;
        const res = isActiveProfile
          ? await client.progress['weekly-reports'].$get(
              {},
              { init: { signal } },
            )
          : await client.dashboard.children[':profileId'][
              'weekly-reports'
            ].$get(
              { param: { profileId: profileId ?? '' } },
              { init: { signal } },
            );
        await assertOk(res);
        const data = weeklyReportsResponseSchema.parse(await res.json());
        return data.reports;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      !!profileId &&
      (profileId === activeProfile.id || activeProfile.isOwner === true),
  });
}

export function invalidateProgressSnapshotQueries(
  queryClient: QueryClient,
  activeProfileId: string | undefined,
): void {
  void queryClient.invalidateQueries({
    queryKey: ['progress', 'inventory', activeProfileId],
  });
  void queryClient.invalidateQueries({
    queryKey: ['progress', 'history', activeProfileId],
  });
  void queryClient.invalidateQueries({
    queryKey: ['progress', 'milestones', activeProfileId],
  });
  void queryClient.invalidateQueries({
    queryKey: ['dashboard'],
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
      invalidateProgressSnapshotQueries(queryClient, activeProfile?.id);
    },
  });
}

export function useChildInventory(
  childProfileId: string | undefined,
  options?: { enabled?: boolean },
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
          { init: { signal } },
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
      (options?.enabled ?? true) &&
      !!activeProfile &&
      activeProfile.isOwner === true &&
      !!childProfileId,
  });
}

export function useChildProgressHistory(
  childProfileId: string | undefined,
  query?: ProgressHistoryQuery,
  options?: { enabled?: boolean },
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
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as { history: ProgressHistory | null };
        return data.history;
      } finally {
        cleanup();
      }
    },
    enabled:
      (options?.enabled ?? true) &&
      !!activeProfile &&
      activeProfile.isOwner === true &&
      !!childProfileId,
  });
}

export function useChildProgressSummary(
  childProfileId: string | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<ProgressSummary | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'progress-summary'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const progressSummaryClient = (
          client.dashboard.children[':profileId'] as unknown as {
            'progress-summary': {
              $get: (
                args: { param: { profileId: string } },
                options?: { init?: RequestInit },
              ) => Promise<Response>;
            };
          }
        )['progress-summary'];
        const res = await progressSummaryClient.$get(
          { param: { profileId: childProfileId ?? '' } },
          { init: { signal } },
        );
        await assertOk(res);
        return progressSummarySchema.parse(await res.json());
      } finally {
        cleanup();
      }
    },
    enabled:
      (options?.enabled ?? true) &&
      !!activeProfile &&
      activeProfile.isOwner === true &&
      !!childProfileId,
  });
}

export function useChildReports(
  childProfileId: string | undefined,
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
          { init: { signal } },
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
  reportId: string | undefined,
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
          { init: { signal } },
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

export function useProfileReportDetail(
  reportId: string | undefined,
): UseQueryResult<MonthlyReportRecord | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['progress', 'profile', activeProfile?.id, 'report', reportId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const reportsClient = (
          client.progress.reports as unknown as {
            ':reportId': {
              $get: (
                args: { param: { reportId: string } },
                options?: { init?: RequestInit },
              ) => Promise<Response>;
            };
          }
        )[':reportId'];
        const res = await reportsClient.$get(
          { param: { reportId: reportId ?? '' } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = childReportDetailResponseSchema.parse(await res.json());
        return data.report;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!reportId,
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
    // [BUG-550] Best-effort tracking — never retry on failure
    retry: 0,
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

// ---------------------------------------------------------------------------
// Weekly Reports [BUG-524]
// ---------------------------------------------------------------------------

export function useChildWeeklyReports(
  childProfileId: string | undefined,
): UseQueryResult<WeeklyReportSummary[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'weekly-reports'],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'][
          'weekly-reports'
        ].$get(
          { param: { profileId: childProfileId ?? '' } },
          { init: { signal } },
        );
        // [BUG-549] New child profiles may return 403 (no family link yet)
        // or 404. Treat these as "no data yet" rather than a hard error so
        // the UI shows a friendly empty state instead of an error card.
        // [IMP-7] Log the status so silent 403s don't mask real ACL bugs.
        if (res.status === 403 || res.status === 404) {
          console.warn(
            `[useChildWeeklyReports] ${res.status} for child ${childProfileId} — returning empty`,
          );
          return [];
        }
        await assertOk(res);
        const data = (await res.json()) as { reports: WeeklyReportSummary[] };
        return data.reports;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}

// ---------------------------------------------------------------------------
// Weekly Report Detail + Mark-Viewed [CR-1, SUGG-1, SUGG-4]
// ---------------------------------------------------------------------------

export function useChildWeeklyReportDetail(
  childProfileId: string | undefined,
  reportId: string | undefined,
): UseQueryResult<WeeklyReportRecord | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['dashboard', 'child', childProfileId, 'weekly-report', reportId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.dashboard.children[':profileId'][
          'weekly-reports'
        ][':reportId'].$get(
          {
            param: {
              profileId: childProfileId ?? '',
              reportId: reportId ?? '',
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as {
          report: WeeklyReportRecord | null;
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

export function useProfileWeeklyReportDetail(
  reportId: string | undefined,
): UseQueryResult<WeeklyReportRecord | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [
      'progress',
      'profile',
      activeProfile?.id,
      'weekly-report',
      reportId,
    ],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const weeklyReportsClient = (
          client.progress['weekly-reports'] as unknown as {
            ':weeklyReportId': {
              $get: (
                args: { param: { weeklyReportId: string } },
                options?: { init?: RequestInit },
              ) => Promise<Response>;
            };
          }
        )[':weeklyReportId'];
        const res = await weeklyReportsClient.$get(
          { param: { weeklyReportId: reportId ?? '' } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = weeklyReportDetailResponseSchema.parse(await res.json());
        return data.report;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!reportId,
  });
}

export function useMarkWeeklyReportViewed(): UseMutationResult<
  { viewed: boolean },
  Error,
  { childProfileId: string; reportId: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    // [SUGG-4] Best-effort tracking — never retry on failure
    retry: 0,
    mutationFn: async ({ childProfileId, reportId }) => {
      const res = await client.dashboard.children[':profileId'][
        'weekly-reports'
      ][':reportId'].view.$post({
        param: { profileId: childProfileId, reportId },
      });
      await assertOk(res);
      return (await res.json()) as { viewed: boolean };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'dashboard',
          'child',
          variables.childProfileId,
          'weekly-reports',
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'dashboard',
          'child',
          variables.childProfileId,
          'weekly-report',
          variables.reportId,
        ],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Self-view Mark-Viewed [I-8]
// ---------------------------------------------------------------------------

export function useMarkProfileReportViewed(): UseMutationResult<
  { viewed: boolean },
  Error,
  { reportId: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    retry: 0,
    mutationFn: async ({ reportId }) => {
      const reportsClient = (
        client.progress.reports as unknown as {
          ':reportId': {
            view: {
              $post: (args: {
                param: { reportId: string };
              }) => Promise<Response>;
            };
          };
        }
      )[':reportId'];
      const res = await reportsClient.view.$post({
        param: { reportId },
      });
      await assertOk(res);
      return (await res.json()) as { viewed: boolean };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'profile', activeProfile?.id, 'reports'],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'progress',
          'profile',
          activeProfile?.id,
          'report',
          variables.reportId,
        ],
      });
    },
  });
}

export function useMarkProfileWeeklyReportViewed(): UseMutationResult<
  { viewed: boolean },
  Error,
  { reportId: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    retry: 0,
    mutationFn: async ({ reportId }) => {
      const weeklyReportsClient = (
        client.progress['weekly-reports'] as unknown as {
          ':weeklyReportId': {
            view: {
              $post: (args: {
                param: { weeklyReportId: string };
              }) => Promise<Response>;
            };
          };
        }
      )[':weeklyReportId'];
      const res = await weeklyReportsClient.view.$post({
        param: { weeklyReportId: reportId },
      });
      await assertOk(res);
      return (await res.json()) as { viewed: boolean };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'profile', activeProfile?.id, 'weekly-reports'],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'progress',
          'profile',
          activeProfile?.id,
          'weekly-report',
          variables.reportId,
        ],
      });
    },
  });
}
