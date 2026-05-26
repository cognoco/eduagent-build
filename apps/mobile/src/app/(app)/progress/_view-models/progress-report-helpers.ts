import type {
  ChildSession,
  MonthlyReportSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';

export type LatestReport =
  | { kind: 'weekly'; report: WeeklyReportSummary }
  | { kind: 'monthly'; report: MonthlyReportSummary };

export function formatReportDate(report: LatestReport): string {
  if (report.kind === 'monthly') {
    const reportMonth = /^\d{4}-\d{2}$/.test(report.report.reportMonth)
      ? `${report.report.reportMonth}-01`
      : report.report.reportMonth;
    return new Date(`${reportMonth}T00:00:00Z`).toLocaleDateString(undefined, {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    });
  }

  const start = new Date(`${report.report.reportWeek}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${startLabel} - ${endLabel}`;
}

export function getLatestReport(
  weeklyReports: WeeklyReportSummary[] | undefined,
  monthlyReports: MonthlyReportSummary[] | undefined,
): LatestReport | null {
  const weekly = weeklyReports?.[0];
  if (weekly) return { kind: 'weekly', report: weekly };
  const monthly = monthlyReports?.[0];
  return monthly ? { kind: 'monthly', report: monthly } : null;
}

export function sessionFocusTitle(session: ChildSession): string {
  return (
    session.homeworkSummary?.displayTitle ??
    session.topicTitle ??
    session.subjectName ??
    session.displayTitle ??
    'Learning session'
  );
}
