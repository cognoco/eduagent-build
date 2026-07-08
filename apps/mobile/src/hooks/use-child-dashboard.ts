import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  KnowledgeInventory,
  MonthlyReportRecord,
  MonthlyReportSummary,
  ProgressSummary,
  WeeklyReportRecord,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import { progressSummarySchema } from '@eduagent/schemas';
import { ForbiddenError, NotFoundError, useApiClient } from '../lib/api-client';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { queryKeys } from '../lib/query-keys';
import { Sentry } from '../lib/sentry';
import { useApiQuery } from './use-api-query';
import { useProgressNavigationScope } from './use-progress-scope';

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
