import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProfileWeeklyReports } from '../../hooks/use-progress';
import { formatMinutes } from '../../lib/format-relative-date';
import type { CopyRegister } from '../../lib/copy-register';

type ReportingComponentProps = {
  profileId: string;
  title?: string;
  register?: CopyRegister;
  thisWeekMini?: {
    sessions: number;
    wordsLearned: number;
    topicsTouched: number;
  };
};

function formatWeek(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function StatChip({
  label,
  testID,
}: {
  label: string;
  testID?: string;
}): React.ReactElement {
  return (
    <View className="bg-surface rounded-full px-3 py-1.5" testID={testID}>
      <Text className="text-caption font-semibold text-text-primary">
        {label}
      </Text>
    </View>
  );
}

export function WeeklyReportCard({
  profileId,
  title,
  register = 'adult',
  thisWeekMini,
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const reportsQuery = useProfileWeeklyReports(profileId);
  const latest = reportsQuery.data?.[0];
  const mini = thisWeekMini ?? {
    sessions: 0,
    wordsLearned: 0,
    topicsTouched: 0,
  };
  const hasMiniSummary =
    mini.sessions > 0 || mini.wordsLearned > 0 || mini.topicsTouched > 0;

  return (
    <View className="bg-surface rounded-card p-4 mt-6" testID="weekly-report">
      <Text className="text-body font-semibold text-text-primary">
        {title ?? t('parentView.reports.weeklySnapshots')}
      </Text>
      {reportsQuery.isLoading ? (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.reports.loadingWeeklySnapshots')}
        </Text>
      ) : reportsQuery.isError ? (
        <View className="py-4 items-center" testID="weekly-report-error">
          <Text className="text-body-sm text-text-secondary text-center mb-3">
            {t('parentView.reports.couldNotLoadWeeklySnapshots')}
          </Text>
          <Pressable
            onPress={() => void reportsQuery.refetch()}
            className="bg-surface rounded-button px-5 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            testID="weekly-report-retry"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
      ) : latest ? (
        <View className="bg-background rounded-card p-3 mt-3">
          <Text className="text-caption text-text-secondary">
            {t('parentView.reports.weekOf')} {formatWeek(latest.reportWeek)}
          </Text>
          <Text className="text-h3 font-semibold text-text-primary mt-2">
            {latest.headlineStat.value} {latest.headlineStat.label}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {latest.headlineStat.comparison}
          </Text>
          {latest.thisWeek ? (
            <View className="flex-row flex-wrap gap-2 mt-3">
              <StatChip
                label={t('progress.weeklyReport.chips.time', {
                  time: formatMinutes(latest.thisWeek.totalActiveMinutes),
                })}
                testID="weekly-report-chip-time"
              />
              {latest.thisWeek.topicsExplored > 0 ? (
                <StatChip
                  label={t('progress.weeklyReport.chips.topics', {
                    count: latest.thisWeek.topicsExplored,
                  })}
                  testID="weekly-report-chip-topics"
                />
              ) : null}
              {latest.thisWeek.streakBest > 0 ? (
                <StatChip
                  label={t('progress.weeklyReport.chips.streak', {
                    count: latest.thisWeek.streakBest,
                  })}
                  testID="weekly-report-chip-streak"
                />
              ) : null}
            </View>
          ) : null}
          {latest.practiceSummary ? (
            <View className="border-t border-border pt-3 mt-3">
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('progress.weeklyReport.practiceTitle')}
              </Text>
              <View className="flex-row gap-2 mt-2">
                <View
                  className="bg-surface rounded-card px-3 py-2 flex-1"
                  testID="weekly-report-quizzes"
                >
                  <Text className="text-h3 font-semibold text-text-primary">
                    {latest.practiceSummary.quizzesCompleted}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-1">
                    {t('progress.weeklyReport.practice.quizzes')}
                  </Text>
                </View>
                <View
                  className="bg-surface rounded-card px-3 py-2 flex-1"
                  testID="weekly-report-reviews"
                >
                  <Text className="text-h3 font-semibold text-text-primary">
                    {latest.practiceSummary.reviewsCompleted}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-1">
                    {t('progress.weeklyReport.practice.reviews')}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : hasMiniSummary ? (
        <View className="bg-background rounded-card p-3 mt-3">
          <Text className="text-caption text-text-secondary">
            {t('progress.weeklyReport.thisWeekSoFar')}
          </Text>
          <View className="flex-row flex-wrap gap-2 mt-3">
            <View className="bg-surface rounded-full px-3 py-1.5">
              <Text className="text-caption font-semibold text-text-primary">
                {t('progress.weeklyReport.mini.sessions', {
                  count: mini.sessions,
                })}
              </Text>
            </View>
            {mini.wordsLearned > 0 ? (
              <View className="bg-surface rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.weeklyReport.mini.words', {
                    count: mini.wordsLearned,
                  })}
                </Text>
              </View>
            ) : null}
            {mini.topicsTouched > 0 ? (
              <View className="bg-surface rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {t('progress.weeklyReport.mini.topics', {
                    count: mini.topicsTouched,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t(`progress.weeklyReport.empty.${register}`)}
        </Text>
      )}
    </View>
  );
}
