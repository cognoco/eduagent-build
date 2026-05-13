import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProfileReports } from '../../hooks/use-progress';
import { formatMinutes } from '../../lib/format-relative-date';
import type { CopyRegister } from '../../lib/copy-register';

type ReportingComponentProps = {
  profileId: string;
  title?: string;
  register?: CopyRegister;
};

function formatMonth(reportMonth: string): string {
  return new Date(`${reportMonth}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function formatMonthEnd(): string {
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return monthEnd.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

function ReportLines({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}): React.ReactElement | null {
  if (lines.length === 0) return null;

  return (
    <View className="border-t border-border pt-3 mt-3">
      <Text className="text-body-sm font-semibold text-text-primary">
        {title}
      </Text>
      <View className="mt-2 gap-2">
        {lines.map((line, index) => (
          <View key={`${line}-${index}`} className="flex-row gap-2">
            <View className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
            <Text className="text-body-sm text-text-secondary flex-1">
              {line}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReportBars({
  metrics,
  quizzesCompleted,
  reviewsCompleted,
}: {
  metrics: {
    totalSessions: number;
    totalActiveMinutes: number;
  };
  quizzesCompleted: number;
  reviewsCompleted: number;
}): React.ReactElement {
  const { t } = useTranslation();
  const values = [
    {
      key: 'sessions',
      label: t('progress.monthlyReport.bars.sessions'),
      value: metrics.totalSessions,
      display: String(metrics.totalSessions),
    },
    {
      key: 'time',
      label: t('progress.monthlyReport.bars.time'),
      value: metrics.totalActiveMinutes,
      display: formatMinutes(metrics.totalActiveMinutes),
    },
    {
      key: 'quizzes',
      label: t('progress.monthlyReport.bars.quizzes'),
      value: quizzesCompleted,
      display: String(quizzesCompleted),
    },
    {
      key: 'reviews',
      label: t('progress.monthlyReport.bars.reviews'),
      value: reviewsCompleted,
      display: String(reviewsCompleted),
    },
  ];
  const maxValue = Math.max(...values.map((item) => item.value), 1);

  return (
    <View className="border-t border-border pt-3 mt-3" testID="monthly-bars">
      <View className="gap-2">
        {values.map((item) => (
          <View key={item.key}>
            <View className="flex-row justify-between mb-1">
              <Text className="text-caption text-text-secondary">
                {item.label}
              </Text>
              <Text className="text-caption font-semibold text-text-primary">
                {item.display}
              </Text>
            </View>
            <View className="h-2 rounded-full bg-surface overflow-hidden">
              <View
                className="h-2 rounded-full bg-primary"
                style={{
                  width: `${Math.max(8, (item.value / maxValue) * 100)}%`,
                }}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MonthlyReportCard({
  profileId,
  title,
  register = 'adult',
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const reportsQuery = useProfileReports(profileId);
  const latest = reportsQuery.data?.[0];
  const highlights = latest?.highlights?.slice(0, 3) ?? [];
  const nextStep = latest?.nextSteps?.[0];

  return (
    <View className="bg-surface rounded-card p-4 mt-4" testID="monthly-report">
      <Text className="text-body font-semibold text-text-primary">
        {title ?? t('parentView.reports.monthlyReports')}
      </Text>
      {reportsQuery.isLoading ? (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.reports.loadingReports')}
        </Text>
      ) : reportsQuery.isError ? (
        <View className="py-4 items-center" testID="monthly-report-error">
          <Text className="text-body-sm text-text-secondary text-center mb-3">
            {t('parentView.reports.couldNotLoadReports')}
          </Text>
          <Pressable
            onPress={() => void reportsQuery.refetch()}
            className="bg-surface rounded-button px-5 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            testID="monthly-report-retry"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
      ) : latest ? (
        <View className="bg-background rounded-card p-3 mt-3">
          <Text className="text-caption text-text-secondary">
            {formatMonth(latest.reportMonth)}
          </Text>
          <Text className="text-h3 font-semibold text-text-primary mt-2">
            {latest.headlineStat.value} {latest.headlineStat.label}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {latest.headlineStat.comparison}
          </Text>
          {latest.thisMonth ? (
            <ReportBars
              metrics={latest.thisMonth}
              quizzesCompleted={latest.practiceSummary?.quizzesCompleted ?? 0}
              reviewsCompleted={latest.practiceSummary?.reviewsCompleted ?? 0}
            />
          ) : null}
          <ReportLines
            title={t('progress.monthlyReport.highlightsTitle')}
            lines={highlights}
          />
          {nextStep ? (
            <View className="border-t border-border pt-3 mt-3">
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('progress.monthlyReport.nextStepTitle')}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-2">
                {nextStep}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t(`progress.monthlyReport.empty.${register}`, {
            month: formatMonthEnd(),
          })}
        </Text>
      )}
    </View>
  );
}
