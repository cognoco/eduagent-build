import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseMutationResult,
  type UseInfiniteQueryResult,
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
  ProgressMetrics,
  ProgressSummary,
  RefreshProgressResponse,
  ReportPracticeSummary,
  ChildSessionsPageResponse,
  ChildSession,
  ContinueSuggestionResponse,
  SubjectProgress,
  TopicProgress,
  WeeklyReportRecord,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import {
  childReportDetailResponseSchema,
  childReportsResponseSchema,
  childSessionsPageResponseSchema,
  childSessionsResponseSchema,
  progressSummarySchema,
  weeklyReportDetailResponseSchema,
  weeklyReportsResponseSchema,
} from '@eduagent/schemas';
import { useApiClient, ForbiddenError, NotFoundError } from '../lib/api-client';
import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { queryKeys } from '../lib/query-keys';
import { Sentry } from '../lib/sentry';
import { useActiveProfileRole } from './use-active-profile-role';
import { useNavigationDataScopeContract } from './use-navigation-contract';
import { useApiQuery } from './use-api-query';

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

function useProgressNavigationScope(): {
  activeProfile: ReturnType<typeof useProfile>['activeProfile'];
  mode: ReturnType<typeof useAppContext>['mode'];
  profileId: string | undefined;
  canAccessFamilyChildData: boolean;
} {
  const { activeProfile } = useProfile();
  const { mode: legacyMode } = useAppContext();
  const activeProfileRole = useActiveProfileRole();
  const navigationContract = useNavigationDataScopeContract();
  const mode = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.queryScope.appContext
    : legacyMode;
  const profileId = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? (navigationContract.queryScope.profileId ?? undefined)
    : activeProfile?.id;
  const canAccessFamilyChildData = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.gates.showFamilyChildActivity
    : legacyMode !== 'study' && activeProfileRole === 'owner';

  return { activeProfile, mode, profileId, canAccessFamilyChildData };
}

function useSelfProgressNavigationScope(): {
  activeProfile: ReturnType<typeof useProfile>['activeProfile'];
  mode: ReturnType<typeof useAppContext>['mode'];
  profileId: string | undefined;
} {
  const { activeProfile } = useProfile();
  const { mode: legacyMode } = useAppContext();
  const navigationContract = useNavigationDataScopeContract();

  if (!FEATURE_FLAGS.MODE_NAV_V1_ENABLED) {
    return { activeProfile, mode: legacyMode, profileId: activeProfile?.id };
  }

  return {
    activeProfile,
    mode: navigationContract.queryScope.appContext,
    profileId: navigationContract.queryScope.profileId ?? undefined,
  };
}

export function useSubjectProgress(
  subjectId: string,
): UseQueryResult<SubjectProgress> {
  const client = useApiClient();
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<{ progress: SubjectProgress }, SubjectProgress>({
    queryKey: queryKeys.progress.subject(mode, subjectId, profileId),
    fetch: (signal) =>
      client.subjects[':subjectId'].progress.$get(
        { param: { subjectId } },
        { init: { signal } },
      ),
    select: (json) => json.progress,
    enabled: !!subjectId,
  });
}

export interface OverallProgressResponse {
  subjects: {
    subjectId: string;
    name: string;
    topicsTotal: number;
    topicsCompleted: number;
    topicsVerified: number;
    topicsMastered: number;
    topicsLearning: number;
    urgencyScore: number;
    retentionStatus: 'strong' | 'fading' | 'weak' | 'forgotten';
    lastSessionAt: string | null;
  }[];
  totalTopicsCompleted: number;
  totalTopicsVerified: number;
  totalTopicsMastered: number;
  totalTopicsLearning: number;
  practiceActivityCount?: number;
  practiceSummary?: ReportPracticeSummary;
}

export function useOverallProgress(): UseQueryResult<OverallProgressResponse> {
  const client = useApiClient();
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<OverallProgressResponse>({
    queryKey: queryKeys.progress.overview(mode, profileId),
    fetch: (signal) => client.progress.overview.$get({}, { init: { signal } }),
    select: (json) => json,
  });
}

export function useContinueSuggestion(): UseQueryResult<
  ContinueSuggestionResponse['suggestion']
> {
  const client = useApiClient();
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<
    ContinueSuggestionResponse,
    ContinueSuggestionResponse['suggestion']
  >({
    queryKey: queryKeys.progress.continue(mode, profileId),
    fetch: (signal) => client.progress.continue.$get({}, { init: { signal } }),
    select: (json) => json.suggestion,
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
  const { activeProfile, mode, profileId } = useSelfProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.resumeTarget(mode, profileId, scope),
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
  const { activeProfile, profileId } = useSelfProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.resumeNudge.root(profileId),
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
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<{ sessionId: string } | null>({
    queryKey: queryKeys.progress.activeSessionForTopic(
      mode,
      topicId,
      profileId,
    ),
    fetch: (signal) =>
      client.progress.topic[':topicId']['active-session'].$get(
        { param: { topicId: topicId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json,
    enabled: !!topicId,
  });
}

// [F-009] Resolve subjectId from topicId — for deep-link resolution
// attempt is incremented by the caller on Retry so the query key changes, forcing a new network
// request even when the previous query is still in-flight (TanStack Query deduplicates by key).
export function useResolveTopicSubject(
  topicId: string | undefined,
  attempt?: number,
) {
  const client = useApiClient();
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<{
    subjectId: string;
    subjectName: string;
    topicTitle: string;
  }>({
    queryKey: queryKeys.progress.resolveTopicSubject(
      mode,
      topicId,
      profileId,
      attempt,
    ),
    fetch: (signal) =>
      client.topics[':topicId'].resolve.$get(
        { param: { topicId: topicId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json,
    enabled: !!topicId,
  });
}

export function useReviewSummary(): UseQueryResult<ReviewSummary> {
  const client = useApiClient();
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<ReviewSummary>({
    queryKey: queryKeys.progress.reviewSummary(mode, profileId),
    fetch: (signal) =>
      client.progress['review-summary'].$get({}, { init: { signal } }),
    select: (json) => json,
  });
}

export function useOverdueTopics(): UseQueryResult<OverdueTopicsResponse> {
  const client = useApiClient();
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<OverdueTopicsResponse>({
    queryKey: queryKeys.progress.overdueTopics(mode, profileId),
    fetch: (signal) =>
      client.progress['overdue-topics'].$get({}, { init: { signal } }),
    select: (json) => json,
  });
}

export function useTopicProgress(
  subjectId: string,
  topicId: string,
): UseQueryResult<TopicProgress> {
  const client = useApiClient();
  const { mode, profileId } = useSelfProgressNavigationScope();

  return useApiQuery<{ topic: TopicProgress }, TopicProgress>({
    queryKey: queryKeys.progress.topicProgress(
      mode,
      subjectId,
      topicId,
      profileId,
    ),
    fetch: (signal) =>
      client.subjects[':subjectId'].topics[':topicId'].progress.$get(
        { param: { subjectId, topicId } },
        { init: { signal } },
      ),
    select: (json) => json.topic,
    enabled: !!subjectId && !!topicId,
  });
}

export function useProgressInventory(): UseQueryResult<KnowledgeInventory> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSelfProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.inventory(mode, profileId),
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

export function useProgressMilestones(
  limit = 5,
): UseQueryResult<MilestoneRecord[]> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSelfProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.milestones(mode, profileId, limit),
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
  const {
    activeProfile,
    mode,
    profileId: viewerProfileId,
    canAccessFamilyChildData,
  } = useProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.profileSessions(
      mode,
      profileId,
      viewerProfileId,
    ),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const isActiveProfile = profileId === viewerProfileId;
        const res = isActiveProfile
          ? await client.progress.sessions.$get(
              { query: {} },
              { init: { signal } },
            )
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
      (profileId === viewerProfileId || canAccessFamilyChildData),
  });
}

export function useProfileSessionsArchive(
  profileId: string | undefined,
  options?: { limit?: number },
): UseInfiniteQueryResult<InfiniteData<ChildSessionsPageResponse>, Error> {
  const client = useApiClient();
  const {
    activeProfile,
    mode,
    profileId: viewerProfileId,
  } = useSelfProgressNavigationScope();

  return useInfiniteQuery({
    queryKey: [
      ...queryKeys.progress.profileSessions(mode, profileId, viewerProfileId),
      'archive',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.progress.sessions.$get(
          {
            query: {
              ...(pageParam ? { cursor: pageParam } : {}),
              ...(options?.limit ? { limit: String(options.limit) } : {}),
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return childSessionsPageResponseSchema.parse(await res.json());
      } finally {
        cleanup();
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!activeProfile && !!profileId && profileId === viewerProfileId,
  });
}

export function useProfileReports(
  profileId: string | undefined,
): UseQueryResult<MonthlyReportSummary[]> {
  const client = useApiClient();
  const {
    activeProfile,
    mode,
    profileId: viewerProfileId,
    canAccessFamilyChildData,
  } = useProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.profileReports(
      mode,
      profileId,
      viewerProfileId,
    ),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const isActiveProfile = profileId === viewerProfileId;
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
      (profileId === viewerProfileId || canAccessFamilyChildData),
  });
}

export function useProfileWeeklyReports(
  profileId: string | undefined,
): UseQueryResult<WeeklyReportSummary[]> {
  const client = useApiClient();
  const {
    activeProfile,
    mode,
    profileId: viewerProfileId,
    canAccessFamilyChildData,
  } = useProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.profileWeeklyReports(
      mode,
      profileId,
      viewerProfileId,
    ),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const isActiveProfile = profileId === viewerProfileId;
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
      (profileId === viewerProfileId || canAccessFamilyChildData),
  });
}

export function invalidateProgressSnapshotQueries(
  queryClient: QueryClient,
  activeProfileId: string | undefined,
): void {
  // PR 10 — mode-agnostic, profile-scoped invalidation of snapshot queries.
  //
  // The previous inline keys `['progress', 'inventory'|'history'|'milestones',
  // activeProfileId]` were silently a no-op in production: React Query's
  // prefix match requires position-by-position equality, but real registry
  // keys have the shape `['progress', mode, kind, profileId, ...]` (slot 1
  // is the navigation mode, not the snapshot kind). Predicate matching lets
  // us cover both 'study' and 'family' cached snapshots without depending on
  // the caller knowing the active mode.
  //
  // Profile scope is preserved: the predicate matches only keys whose
  // `profileId` slot equals `activeProfileId`, so a shared-device parent
  // refresh does not invalidate another profile's cache.
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const k = query.queryKey;
      if (k[0] !== 'progress') return false;
      const kind = k[2];
      if (kind !== 'inventory' && kind !== 'history' && kind !== 'milestones') {
        return false;
      }
      return k[3] === activeProfileId;
    },
  });
  // PR-10 deferred: broad ['dashboard'] — snapshot refresh by a parent must
  // make every child-view (detail, sessions, inventory, history, reports,
  // memory, ...) stale. A workflow test enumerating the full dashboard
  // surface set per the registry is required before narrowing.
  void queryClient.invalidateQueries({
    queryKey: ['dashboard'],
  });
}

export type { ProgressMetrics };

export function useRefreshProgressSnapshot(): UseMutationResult<
  RefreshProgressResponse,
  Error,
  void
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profileId } = useSelfProgressNavigationScope();

  return useMutation<RefreshProgressResponse, Error, void>({
    mutationFn: async () => {
      const res = await client.progress.refresh.$post();
      await assertOk(res);
      return (await res.json()) as RefreshProgressResponse;
    },
    onSuccess: () => {
      invalidateProgressSnapshotQueries(queryClient, profileId);
    },
  });
}

export function useChildInventory(
  childProfileId: string | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<KnowledgeInventory | null> {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useProgressNavigationScope();

  return useApiQuery<
    { inventory: KnowledgeInventory | null },
    KnowledgeInventory | null
  >({
    queryKey: queryKeys.dashboard.childInventory(mode, childProfileId),
    fetch: (signal) =>
      client.dashboard.children[':profileId'].inventory.$get(
        { param: { profileId: childProfileId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json.inventory,
    enabled:
      (options?.enabled ?? true) &&
      canAccessFamilyChildData &&
      !!childProfileId,
  });
}

export function useChildProgressSummary(
  childProfileId: string | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<ProgressSummary | null> {
  const client = useApiClient();
  const { activeProfile, mode, canAccessFamilyChildData } =
    useProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.dashboard.childProgressSummary(mode, childProfileId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        // Hono RPC does not type hyphenated path segments, so the route segment
        // is cast to the handler shape used by /progress-summary.
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
      canAccessFamilyChildData &&
      !!childProfileId,
  });
}

export function useChildReports(
  childProfileId: string | undefined,
): UseQueryResult<MonthlyReportSummary[]> {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useProgressNavigationScope();

  return useApiQuery<
    { reports: MonthlyReportSummary[] },
    MonthlyReportSummary[]
  >({
    queryKey: queryKeys.dashboard.childReports(mode, childProfileId),
    fetch: (signal) =>
      client.dashboard.children[':profileId'].reports.$get(
        { param: { profileId: childProfileId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json.reports,
    enabled: canAccessFamilyChildData && !!childProfileId,
  });
}

export function useChildReportDetail(
  childProfileId: string | undefined,
  reportId: string | undefined,
): UseQueryResult<MonthlyReportRecord | null> {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useProgressNavigationScope();

  return useApiQuery<
    { report: MonthlyReportRecord | null },
    MonthlyReportRecord | null
  >({
    queryKey: queryKeys.dashboard.childReportDetail(
      mode,
      childProfileId,
      reportId,
    ),
    fetch: (signal) =>
      client.dashboard.children[':profileId'].reports[':reportId'].$get(
        {
          param: {
            profileId: childProfileId ?? '',
            reportId: reportId ?? '',
          },
        },
        { init: { signal } },
      ),
    select: (json) => json.report,
    enabled: canAccessFamilyChildData && !!childProfileId && !!reportId,
  });
}

export function useProfileReportDetail(
  reportId: string | undefined,
): UseQueryResult<MonthlyReportRecord | null> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSelfProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.profileReportDetail(mode, profileId, reportId),
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
  const { mode } = useProgressNavigationScope();

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
        queryKey: queryKeys.dashboard.childReports(
          mode,
          variables.childProfileId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.childReportDetail(
          mode,
          variables.childProfileId,
          variables.reportId,
        ),
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
  const { activeProfile, mode, canAccessFamilyChildData } =
    useProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.dashboard.childWeeklyReports(mode, childProfileId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        try {
          const res = await client.dashboard.children[':profileId'][
            'weekly-reports'
          ].$get(
            { param: { profileId: childProfileId ?? '' } },
            { init: { signal } },
          );
          await assertOk(res);
          const data = (await res.json()) as {
            reports: WeeklyReportSummary[];
          };
          return data.reports;
        } catch (err) {
          // [CR-2026-05-19-H27] Escalate family-link ACL failures to Sentry
          // with the queryable tag so a broken or revoked family link is not
          // invisible in production. Previously this was a console.warn-only
          // swallow that returned [], which violated AGENTS.md "Silent
          // recovery without escalation is banned" — and also masked a real
          // IDOR/ACL regression behind an empty-state UI. The typed error
          // (ForbiddenError / NotFoundError already classified by the API
          // client middleware) is rethrown so React Query surfaces isError
          // and the consuming screen renders its standard error fallback
          // (retry + back) per the UX Resilience Rules.
          if (err instanceof ForbiddenError || err instanceof NotFoundError) {
            Sentry.captureException(err, {
              tags: {
                hook: 'useChildWeeklyReports',
                error_kind:
                  err instanceof ForbiddenError ? 'forbidden' : 'not_found',
              },
              extra: { childProfileId },
            });
          }
          throw err;
        }
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && canAccessFamilyChildData && !!childProfileId,
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
  const { mode, canAccessFamilyChildData } = useProgressNavigationScope();

  return useApiQuery<
    { report: WeeklyReportRecord | null },
    WeeklyReportRecord | null
  >({
    queryKey: queryKeys.dashboard.childWeeklyReportDetail(
      mode,
      childProfileId,
      reportId,
    ),
    fetch: (signal) =>
      client.dashboard.children[':profileId']['weekly-reports'][
        ':reportId'
      ].$get(
        {
          param: {
            profileId: childProfileId ?? '',
            reportId: reportId ?? '',
          },
        },
        { init: { signal } },
      ),
    select: (json) => json.report,
    enabled: canAccessFamilyChildData && !!childProfileId && !!reportId,
  });
}

export function useProfileWeeklyReportDetail(
  reportId: string | undefined,
): UseQueryResult<WeeklyReportRecord | null> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useSelfProgressNavigationScope();

  return useQuery({
    queryKey: queryKeys.progress.profileWeeklyReportDetail(
      mode,
      profileId,
      reportId,
    ),
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
  const { mode } = useProgressNavigationScope();

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
        queryKey: queryKeys.dashboard.childWeeklyReports(
          mode,
          variables.childProfileId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.childWeeklyReportDetail(
          mode,
          variables.childProfileId,
          variables.reportId,
        ),
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
  const { mode, profileId } = useSelfProgressNavigationScope();

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
        queryKey: ['progress', mode, 'profile', profileId, 'reports'],
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.progress.profileReportDetail(
          mode,
          profileId,
          variables.reportId,
        ),
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
  const { mode, profileId } = useSelfProgressNavigationScope();

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
        queryKey: ['progress', mode, 'profile', profileId, 'weekly-reports'],
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.progress.profileWeeklyReportDetail(
          mode,
          profileId,
          variables.reportId,
        ),
      });
    },
  });
}
