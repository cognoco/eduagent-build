import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '../../../../components/common';
import { MetricCard } from '../../../../components/progress';
import { classifyApiError } from '../../../../lib/format-api-error';
import { goBackOrReplace } from '../../../../lib/navigation';
import { useProfileWeeklyReportDetail } from '../../../../hooks/use-progress';

function formatWeeklyReportRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 'Weekly report';
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${startLabel} - ${endLabel}`;
}

export default function ProgressWeeklyReportDetail(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { weeklyReportId } = useLocalSearchParams<{
    weeklyReportId: string;
  }>();
  const reportId = Array.isArray(weeklyReportId)
    ? weeklyReportId[0]
    : weeklyReportId;
  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfileWeeklyReportDetail(reportId);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/progress/reports')}
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="progress-weekly-report-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {report
                ? formatWeeklyReportRange(report.reportData.weekStart)
                : t('parentView.weeklyReport.weeklyReport')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {t('parentView.weeklyReport.subtitle')}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.weeklyReport.loadingReport')}
            </Text>
          </View>
        ) : isError ? (
          <ErrorFallback
            variant="card"
            message={classifyApiError(error).message}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void refetch(),
              testID: 'progress-weekly-report-error-retry',
            }}
            secondaryAction={{
              label: t('parentView.weeklyReport.backToReports'),
              onPress: () => goBackOrReplace(router, '/(app)/progress/reports'),
              testID: 'progress-weekly-report-error-back',
            }}
            testID="progress-weekly-report-error"
          />
        ) : report ? (
          <>
            <View className="bg-coaching-card rounded-card p-5 mt-4">
              <Text className="text-h1 font-bold text-text-primary">
                {report.reportData.headlineStat.value}{' '}
                {report.reportData.headlineStat.label.toLowerCase()}
              </Text>
              <Text className="text-body text-text-secondary mt-2">
                {report.reportData.headlineStat.comparison}
              </Text>
            </View>

            <View className="flex-row gap-3 mt-4">
              <MetricCard
                label={t('parentView.weeklyReport.sessionsThisWeek')}
                value={String(report.reportData.thisWeek.totalSessions)}
              />
              <MetricCard
                label={t('parentView.weeklyReport.timeOnApp')}
                value={String(report.reportData.thisWeek.totalActiveMinutes)}
              />
            </View>
          </>
        ) : (
          <View className="bg-surface rounded-card p-5 mt-4">
            <Text className="text-h3 font-semibold text-text-primary">
              {t('parentView.weeklyReport.reportGoneTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              {t('parentView.weeklyReport.reportGoneBody')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
