import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '../../../../components/common';
import { MetricCard } from '../../../../components/progress';
import { classifyApiError } from '../../../../lib/format-api-error';
import { formatMinutes } from '../../../../lib/format-relative-date';
import { goBackOrReplace } from '../../../../lib/navigation';
import {
  useProfileReportDetail,
  useMarkProfileReportViewed,
} from '../../../../hooks/use-progress';

export default function ProgressMonthlyReportDetail(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const resolvedReportId = Array.isArray(reportId) ? reportId[0] : reportId;
  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfileReportDetail(resolvedReportId);

  const markViewed = useMarkProfileReportViewed();
  const markViewedRef = useRef(markViewed);
  markViewedRef.current = markViewed;
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!resolvedReportId || !report || report.viewedAt) return;
    if (viewedRef.current) return;
    viewedRef.current = true;
    markViewedRef.current
      .mutateAsync({ reportId: resolvedReportId })
      .catch((err: unknown) => {
        Sentry.captureException(err, {
          tags: { feature: 'monthly_report', action: 'mark_viewed_self' },
          extra: { reportId: resolvedReportId },
        });
      });
  }, [resolvedReportId, report]);

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
                value={formatMinutes(
                  report.reportData.thisMonth.totalActiveMinutes,
                )}
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <MetricCard
                label={t('parentView.report.testsCompleted')}
                value={String(
                  report.reportData.practiceSummary?.totals
                    .activitiesCompleted ?? 0,
                )}
              />
              <MetricCard
                label={t('parentView.report.testPoints')}
                value={String(
                  report.reportData.practiceSummary?.totals.pointsEarned ?? 0,
                )}
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
