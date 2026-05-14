import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  MonthlyReportSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';

export interface ReportsListProps {
  monthlyReports: MonthlyReportSummary[];
  weeklyReports: WeeklyReportSummary[];
  /**
   * Optional row cap. If set, the combined sorted list is truncated to N rows.
   * Used by the progress-overview screen to show "recent reports" only.
   */
  limit?: number;
  onPressMonthly: (reportId: string) => void;
  onPressWeekly: (reportId: string) => void;
  /**
   * Optional testID prefix for the container element.
   */
  testID?: string;
  /** Whether to show "New" badge for unviewed reports. Defaults to false. */
  showNewBadge?: boolean;
}

type ReportListItem =
  | { kind: 'weekly'; sortDate: string; report: WeeklyReportSummary }
  | { kind: 'monthly'; sortDate: string; report: MonthlyReportSummary };

function formatDateOnly(
  isoDate: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    ...options,
    timeZone: 'UTC',
  });
}

export function ReportsList({
  monthlyReports,
  weeklyReports,
  limit,
  onPressMonthly,
  onPressWeekly,
  testID,
  showNewBadge = false,
}: ReportsListProps): React.ReactElement {
  const { t } = useTranslation();

  const allItems: ReportListItem[] = [
    ...weeklyReports.map((report) => ({
      kind: 'weekly' as const,
      report,
      sortDate: report.reportWeek,
    })),
    ...monthlyReports.map((report) => ({
      kind: 'monthly' as const,
      report,
      sortDate: report.reportMonth,
    })),
  ].sort((a, b) => b.sortDate.localeCompare(a.sortDate));

  const reportItems = limit !== undefined ? allItems.slice(0, limit) : allItems;
  const isEmpty = monthlyReports.length === 0 && weeklyReports.length === 0;

  return (
    <View testID={testID ?? 'reports-list'}>
      {isEmpty ? (
        <Text
          className="text-body-sm text-text-secondary mt-2"
          testID="reports-list-empty"
        >
          {t('parentView.index.firstReportSoon')}
        </Text>
      ) : (
        reportItems.map((item) => {
          const title =
            item.kind === 'weekly'
              ? `${t('parentView.reports.weekOf')} ${formatDateOnly(
                  item.report.reportWeek,
                  {
                    month: 'short',
                    day: 'numeric',
                  },
                )}`
              : formatDateOnly(item.report.reportMonth, {
                  month: 'long',
                  year: 'numeric',
                });

          /**
           * testIDs preserved from the old components:
           *   - weekly rows:  `weekly-report-card-{id}`   (from child/reports e2e flow)
           *   - monthly rows: `report-card-{id}`          (from child/reports)
           *   - progress full-list rows: `progress-report-row-{id}` (from progress/reports/index)
           * All three patterns are kept so existing tests and e2e flows remain valid.
           * The `report-row-{id}` testID (spec proposal) is NOT used here — existing automation
           * depends on the above names.
           */
          const rowTestID =
            item.kind === 'weekly'
              ? `weekly-report-card-${item.report.id}`
              : `report-card-${item.report.id}`;

          return (
            <Pressable
              key={`${item.kind}-${item.report.id}`}
              onPress={() =>
                item.kind === 'weekly'
                  ? onPressWeekly(item.report.id)
                  : onPressMonthly(item.report.id)
              }
              className="bg-surface rounded-card p-4 mt-4"
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${item.report.headlineStat.label}: ${item.report.headlineStat.value}`}
              testID={rowTestID}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 me-3">
                  <Text className="text-body font-semibold text-text-primary">
                    {title}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {item.report.headlineStat.label}:{' '}
                    {item.report.headlineStat.value}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-1">
                    {item.report.headlineStat.comparison}
                  </Text>
                </View>
                {showNewBadge && !item.report.viewedAt ? (
                  <View className="bg-accent/15 rounded-full px-3 py-1">
                    <Text className="text-caption font-semibold text-accent">
                      {t('parentView.reports.newBadge')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}
