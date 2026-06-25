import type {
  ChildSession,
  MonthlyReportSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import { formatShortDate } from '../../../../lib/format-datetime';

export type LatestReport =
  | { kind: 'weekly'; report: WeeklyReportSummary }
  | { kind: 'monthly'; report: MonthlyReportSummary };

export function formatReportDate(
  report: LatestReport,
  locale?: string,
): string {
  if (report.kind === 'monthly') {
    const reportMonth = /^\d{4}-\d{2}$/.test(report.report.reportMonth)
      ? `${report.report.reportMonth}-01`
      : report.report.reportMonth;
    return formatShortDate(`${reportMonth}T00:00:00Z`, locale, {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    });
  }

  const start = new Date(`${report.report.reportWeek}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const startLabel = formatShortDate(start, locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = formatShortDate(end, locale, {
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
