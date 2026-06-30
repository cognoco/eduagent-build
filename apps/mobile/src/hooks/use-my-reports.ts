// ---------------------------------------------------------------------------
// Self-scope-only report hooks for the Journal tab (S3, WI-1122).
//
// These hooks always fetch for the active profile's own reports (never a child
// or family-scoped view). The query keys intentionally omit the mode dimension
// so cache entries are stable regardless of the navigation mode — the Journal
// tab is always self-scoped.
// ---------------------------------------------------------------------------

import { type UseQueryResult } from '@tanstack/react-query';
import type {
  MonthlyReportSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import {
  childReportsResponseSchema,
  weeklyReportsResponseSchema,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';

/**
 * Fetches monthly reports for the active profile's own scope.
 * Key: ['my-reports', 'monthly', profileId] — no mode dimension.
 */
export function useMyReports(): UseQueryResult<MonthlyReportSummary[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  return useApiQuery({
    queryKey: ['my-reports', 'monthly', profileId],
    fetch: (signal) => client.progress.reports.$get({}, { init: { signal } }),
    select: (json: unknown) => childReportsResponseSchema.parse(json).reports,
  });
}

/**
 * Fetches weekly reports for the active profile's own scope.
 * Key: ['my-reports', 'weekly', profileId] — no mode dimension.
 */
export function useMyWeeklyReports(): UseQueryResult<WeeklyReportSummary[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  return useApiQuery({
    queryKey: ['my-reports', 'weekly', profileId],
    fetch: (signal) =>
      client.progress['weekly-reports'].$get({}, { init: { signal } }),
    select: (json: unknown) => weeklyReportsResponseSchema.parse(json).reports,
  });
}
