import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '../../../../components/progress';
import { formatMinutes } from '../../../../lib/format-relative-date';
import {
  formatReportDate,
  type LatestReport,
} from '../_view-models/progress-report-helpers';

export function LatestReportCard({
  latestReport,
  isError,
  isLoading,
  onOpen,
  onRetry,
}: {
  latestReport: LatestReport | null;
  isError: boolean;
  isLoading: boolean;
  onOpen: () => void;
  onRetry: () => void;
}): React.ReactElement {
  const { t, i18n } = useTranslation();
  const metrics =
    latestReport?.kind === 'weekly'
      ? latestReport.report.thisWeek
      : latestReport?.report.thisMonth;
  const practiceTotals = latestReport?.report.practiceSummary?.totals;

  return (
    <View className="mt-6" testID="progress-latest-report-section">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-h3 font-semibold text-text-primary">
          {t('progress.latestReport.title')}
        </Text>
        {latestReport ? (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t('progress.latestReport.open')}
            testID="progress-latest-report-open"
          >
            <Text className="text-body-sm text-primary font-semibold">
              {t('progress.latestReport.open')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="bg-surface rounded-card p-4">
        {isLoading && !latestReport ? (
          <>
            <View className="bg-border rounded h-5 w-1/2 mb-3" />
            <View className="bg-border rounded h-4 w-full mb-2" />
            <View className="bg-border rounded h-4 w-2/3" />
          </>
        ) : isError && !latestReport ? (
          <View testID="progress-latest-report-error">
            <Text className="text-body text-text-secondary mb-3">
              {t('progress.latestReport.error')}
            </Text>
            <Pressable
              onPress={onRetry}
              className="bg-background rounded-button px-4 py-3 items-center self-start"
              accessibilityRole="button"
              accessibilityLabel={t('common.tryAgain')}
              testID="progress-latest-report-retry"
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('common.tryAgain')}
              </Text>
            </Pressable>
          </View>
        ) : latestReport ? (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t('progress.latestReport.openWithDate', {
              date: formatReportDate(latestReport, i18n?.language),
            })}
            testID="progress-latest-report-card"
          >
            <Text className="text-body-sm text-text-secondary">
              {formatReportDate(latestReport, i18n?.language)}
            </Text>
            <Text className="text-h2 font-bold text-text-primary mt-2">
              {latestReport.report.headlineStat.value}{' '}
              {latestReport.report.headlineStat.label}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {latestReport.report.headlineStat.comparison}
            </Text>
            {metrics ? (
              <>
                <View className="flex-row gap-3 mt-4">
                  <MetricCard
                    label={t('progress.latestReport.sessions')}
                    value={String(metrics.totalSessions)}
                  />
                  <MetricCard
                    label={t('progress.latestReport.time')}
                    value={formatMinutes(metrics.totalActiveMinutes)}
                  />
                </View>
                <View className="flex-row gap-3 mt-3">
                  <MetricCard
                    label={t('progress.latestReport.topics')}
                    value={String(metrics.topicsMastered)}
                  />
                  <MetricCard
                    label={t('progress.latestReport.words')}
                    value={String(metrics.vocabularyTotal)}
                  />
                </View>
              </>
            ) : null}
            {practiceTotals &&
            (practiceTotals.activitiesCompleted > 0 ||
              practiceTotals.pointsEarned > 0) ? (
              <View className="flex-row flex-wrap gap-2 mt-4">
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    {t('progress.latestReport.practiceLessons', {
                      count: practiceTotals.activitiesCompleted,
                    })}
                  </Text>
                </View>
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    {t('progress.latestReport.practicePoints', {
                      count: practiceTotals.pointsEarned,
                    })}
                  </Text>
                </View>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <Text
            className="text-body text-text-secondary"
            testID="progress-latest-report-empty"
          >
            {t('progress.latestReport.empty')}
          </Text>
        )}
      </View>
    </View>
  );
}
