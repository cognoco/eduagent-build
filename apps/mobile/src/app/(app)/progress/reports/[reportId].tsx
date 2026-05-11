import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '../../../../components/common';
import { classifyApiError } from '../../../../lib/format-api-error';
import { goBackOrReplace } from '../../../../lib/navigation';
import { useProfileReportDetail } from '../../../../hooks/use-progress';

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View className="bg-background rounded-card p-4 flex-1">
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {value}
      </Text>
    </View>
  );
}

export default function ProgressMonthlyReportDetail(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfileReportDetail(Array.isArray(reportId) ? reportId[0] : reportId);

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
            testID="progress-report-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {report?.reportData.month ?? t('parentView.report.monthlyReport')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {t('parentView.report.subtitle')}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.report.loadingReport')}
            </Text>
          </View>
        ) : isError ? (
          <ErrorFallback
            variant="card"
            message={classifyApiError(error).message}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void refetch(),
              testID: 'progress-report-error-retry',
            }}
            secondaryAction={{
              label: t('parentView.report.backToReports'),
              onPress: () => goBackOrReplace(router, '/(app)/progress/reports'),
              testID: 'progress-report-error-back',
            }}
            testID="progress-report-error"
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
                label={t('parentView.report.sessions')}
                value={String(report.reportData.thisMonth.totalSessions)}
              />
              <MetricCard
                label={t('parentView.report.timeOnApp')}
                value={String(report.reportData.thisMonth.totalActiveMinutes)}
              />
            </View>

            {report.reportData.highlights.length > 0 ? (
              <View className="bg-surface rounded-card p-4 mt-4">
                <Text className="text-h3 font-semibold text-text-primary">
                  {t('parentView.report.highlights')}
                </Text>
                <View className="mt-3 gap-2">
                  {report.reportData.highlights.map((highlight) => (
                    <Text
                      key={highlight}
                      className="text-body-sm text-text-secondary"
                    >
                      - {highlight}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View className="bg-surface rounded-card p-5 mt-4">
            <Text className="text-h3 font-semibold text-text-primary">
              {t('parentView.report.reportGoneTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              {t('parentView.report.reportGoneBody')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
