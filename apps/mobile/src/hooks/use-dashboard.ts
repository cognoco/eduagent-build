import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useApiQuery } from './use-api-query';
import type {
  CuratedMemoryView,
  DashboardChildDetail,
  DashboardData,
  TopicProgress,
  VerifiedProofResponse,
} from '@eduagent/schemas';
import {
  childDetailResponseSchema,
  childMemoryResponseSchema,
  childSessionDetailResponseSchema,
  childSessionsResponseSchema,
  childSubjectTopicsResponseSchema,
  dashboardResponseSchema,
  demoDashboardDataSchema,
  noticeSeenResponseSchema,
  verifiedProofResponseSchema,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';
import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import { queryKeys } from '../lib/query-keys';
import { useActiveProfileRole } from './use-active-profile-role';
import { useNavigationDataScopeContract } from './use-navigation-contract';

function useDashboardNavigationScope(): {
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

export function useDashboard(): UseQueryResult<DashboardData> {
  const client = useApiClient();
  const { activeProfile, mode, profileId } = useDashboardNavigationScope();

  return useQuery({
    queryKey: queryKeys.dashboard.root(mode, profileId),
    queryFn: async ({ signal: querySignal }): Promise<DashboardData> => {
      // Bug #7 fix: combine TanStack Query's cancellation signal with a
      // 10s timeout so the request aborts if the API is unreachable,
      // instead of hanging forever and showing skeletons indefinitely.
      const { signal, cleanup } = combinedSignal(querySignal);

      try {
        const res = await client.dashboard.$get({}, { init: { signal } });
        await assertOk(res);
        const data = await parseJson(
          res,
          dashboardResponseSchema,
          'GET /dashboard',
        );

        // [WI-854 / HOME-15] Only fall back to demo data for a genuinely empty
        // dashboard. When the last child is archived/deleted the real response
        // has empty children BUT carries pending consent notices — demo data has
        // none, so substituting it would hide the owner post-grace consent
        // archive/delete toast. Preserve the real dashboard whenever notices are
        // present.
        const hasNoChildren = (data.children?.length ?? 0) === 0;
        const hasPendingNotices = (data.pendingNotices?.length ?? 0) > 0;

        if (hasNoChildren && !hasPendingNotices) {
          const demoRes = await client.dashboard.demo.$get(
            {},
            { init: { signal } },
          );
          await assertOk(demoRes);
          return parseJson(
            demoRes,
            demoDashboardDataSchema,
            'GET /dashboard/demo',
          );
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
  const { mode, profileId } = useDashboardNavigationScope();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await client.notices[':id'].seen.$post({
        param: { id },
      });
      await assertOk(res);
      return parseJson(res, noticeSeenResponseSchema, 'POST /notices/:id/seen');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.root(mode, profileId),
      });
    },
  });
}

export function useChildDetail(
  childProfileId: string | undefined,
): UseQueryResult<DashboardChildDetail | null> {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useDashboardNavigationScope();

  return useApiQuery<
    { child: DashboardChildDetail | null },
    DashboardChildDetail | null
  >({
    queryKey: queryKeys.dashboard.childDetail(mode, childProfileId),
    enabled: canAccessFamilyChildData && !!childProfileId,
    schema: childDetailResponseSchema,
    fetch: (signal) =>
      client.dashboard.children[':profileId'].$get(
        { param: { profileId: childProfileId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json.child,
  });
}

/**
 * [WI-1658] Latest verified-proof receipt for the parent home card.
 *
 * Hono RPC does not type hyphenated path segments — the `verified-proof`
 * route segment is cast to the handler shape, mirroring the precedent in
 * use-child-dashboard.ts's `useChildProgressSummary` (`progress-summary`).
 */
export function useVerifiedProof(
  childProfileId: string | undefined,
): UseQueryResult<VerifiedProofResponse> {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useDashboardNavigationScope();

  return useApiQuery<VerifiedProofResponse, VerifiedProofResponse>({
    queryKey: queryKeys.dashboard.childVerifiedProof(mode, childProfileId),
    enabled: canAccessFamilyChildData && !!childProfileId,
    schema: verifiedProofResponseSchema,
    fetch: (signal) => {
      const verifiedProofClient = (
        client.dashboard.children[':profileId'] as unknown as {
          'verified-proof': {
            $get: (
              args: { param: { profileId: string } },
              options?: { init?: RequestInit },
            ) => Promise<Response>;
          };
        }
      )['verified-proof'];
      return verifiedProofClient.$get(
        { param: { profileId: childProfileId ?? '' } },
        { init: { signal } },
      );
    },
    select: (json) => json,
  });
}

export function useChildSubjectTopics(
  childProfileId: string | undefined,
  subjectId: string | undefined,
): UseQueryResult<TopicProgress[]> {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useDashboardNavigationScope();

  return useApiQuery<{ topics: TopicProgress[] }, TopicProgress[]>({
    queryKey: queryKeys.dashboard.childSubject(mode, childProfileId, subjectId),
    enabled: canAccessFamilyChildData && !!childProfileId && !!subjectId,
    schema: childSubjectTopicsResponseSchema,
    fetch: (signal) =>
      client.dashboard.children[':profileId'].subjects[':subjectId'].$get(
        {
          param: {
            profileId: childProfileId ?? '',
            subjectId: subjectId ?? '',
          },
        },
        { init: { signal } },
      ),
    select: (json) => json.topics,
  });
}

export function useChildSessions(childProfileId: string | undefined) {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useDashboardNavigationScope();

  return useApiQuery<{ sessions: unknown[] }, unknown[]>({
    queryKey: queryKeys.dashboard.childSessions(mode, childProfileId),
    enabled: canAccessFamilyChildData && !!childProfileId,
    schema: childSessionsResponseSchema,
    fetch: (signal) =>
      client.dashboard.children[':profileId'].sessions.$get(
        { param: { profileId: childProfileId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json.sessions,
  });
}

export function useChildSessionDetail(
  childProfileId: string | undefined,
  sessionId: string | undefined,
) {
  const client = useApiClient();
  const { activeProfile, mode, canAccessFamilyChildData } =
    useDashboardNavigationScope();

  return useQuery({
    queryKey: queryKeys.dashboard.childSessionDetail(
      mode,
      childProfileId,
      sessionId,
    ),
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
        const data = await parseJson(
          res,
          childSessionDetailResponseSchema,
          'GET /dashboard/children/:profileId/sessions/:sessionId',
        );
        return data.session;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile &&
      canAccessFamilyChildData &&
      !!childProfileId &&
      !!sessionId,
  });
}

export function useChildMemory(childProfileId: string | undefined) {
  const client = useApiClient();
  const { mode, canAccessFamilyChildData } = useDashboardNavigationScope();

  return useApiQuery<{ memory: CuratedMemoryView }, CuratedMemoryView>({
    queryKey: queryKeys.dashboard.childMemory(mode, childProfileId),
    enabled: canAccessFamilyChildData && !!childProfileId,
    schema: childMemoryResponseSchema,
    fetch: (signal) =>
      client.dashboard.children[':profileId'].memory.$get(
        { param: { profileId: childProfileId ?? '' } },
        { init: { signal } },
      ),
    select: (json) => json.memory,
  });
}
