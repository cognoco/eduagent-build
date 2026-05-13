import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type {
  MonthlyReportSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import {
  useProfileReports,
  useProfileWeeklyReports,
} from '../../hooks/use-progress';

type ReportingComponentProps = {
  profileId: string;
  interactive?: boolean;
  selfView?: boolean;
  limit?: number;
};

type ReportListItem =
  | { kind: 'weekly'; sortDate: string; report: WeeklyReportSummary }
  | { kind: 'monthly'; sortDate: string; report: MonthlyReportSummary };

function formatDateOnly(isoDate: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    ...options,
    timeZone: 'UTC',
  });
}

export function ReportsListCard({
  profileId,
  interactive = false,
  selfView = false,
  limit = 3,
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const weeklyReports = useProfileWeeklyReports(profileId);
  const monthlyReports = useProfileReports(profileId);
  const weeklyItems = weeklyReports.data ?? [];
  const monthlyItems = monthlyReports.data ?? [];
  const hasRenderableReports =
    weeklyItems.length > 0 || monthlyItems.length > 0;
  const showLoading =
    !hasRenderableReports &&
    (weeklyReports.isLoading || monthlyReports.isLoading);
  const showError =
    !hasRenderableReports && (weeklyReports.isError || monthlyReports.isError);
  const reportItems: ReportListItem[] = [
    ...weeklyItems.map((report) => ({
      kind: 'weekly' as const,
      report,
      sortDate: report.reportWeek,
    })),
    ...monthlyItems.map((report) => ({
      kind: 'monthly' as const,
      report,
      sortDate: report.reportMonth,
    })),
  ]
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate))
    .slice(0, limit);

  const reportsPath = selfView
    ? ('/(app)/progress/reports' as Href)
    : ({
        pathname: '/(app)/child/[profileId]/reports',
        params: { profileId },
      } as Href);
  const viewAllTestID = selfView
    ? 'progress-reports-link'
    : 'child-reports-link';

  return (
    <View className="bg-surface rounded-card p-4 mt-6" testID="reports-list">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-body font-semibold text-text-primary">
          {t('progress.previousReports.title')}
        </Text>
        {interactive ? (
          <Pressable
            onPress={() => router.push(reportsPath)}
            accessibilityRole="button"
            accessibilityLabel={t('progress.previousReports.viewAll')}
            testID={viewAllTestID}
          >
            <Text className="text-body-sm text-primary font-semibold">
              {t('progress.previousReports.viewAll')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {showLoading ? (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.reports.loadingReports')}
        </Text>
      ) : showError ? (
        <View className="mt-2" testID="reports-list-error">
          <Text className="text-body-sm text-text-secondary">
            {t('parentView.reports.checkConnectionRetry')}
          </Text>
          <Pressable
            onPress={() => {
              void weeklyReports.refetch();
              void monthlyReports.refetch();
            }}
            className="bg-primary rounded-button px-4 py-3 mt-3 items-center min-h-[48px] justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain')}
            testID="reports-list-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
        </View>
      ) : reportItems.length > 0 ? (
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
          const href =
            item.kind === 'weekly'
              ? selfView
                ? ({
                    pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
                    params: { weeklyReportId: item.report.id },
                  } as Href)
                : ({
                    pathname:
                      '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
                    params: { profileId, weeklyReportId: item.report.id },
                  } as Href)
              : selfView
                ? ({
                    pathname: '/(app)/progress/reports/[reportId]',
                    params: { reportId: item.report.id },
                  } as Href)
                : ({
                    pathname: '/(app)/child/[profileId]/report/[reportId]',
                    params: { profileId, reportId: item.report.id },
                  } as Href);

          return (
            <Pressable
              key={item.report.id}
              disabled={!interactive}
              className="bg-background rounded-card p-3 mt-3"
              testID={`${
                item.kind === 'weekly' ? 'weekly-report' : 'report'
              }-card-${item.report.id}`}
              onPress={() => router.push(href)}
              accessibilityRole={interactive ? 'button' : undefined}
              accessibilityLabel={`${title}. ${item.report.headlineStat.label}: ${item.report.headlineStat.value}`}
            >
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
            </Pressable>
          );
        })
      ) : (
        <Text
          className="text-body-sm text-text-secondary mt-2"
          testID="reports-list-empty"
        >
          {t('parentView.index.firstReportSoon')}
        </Text>
      )}
    </View>
  );
}
