import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProfileWeeklyReports } from '../../hooks/use-progress';
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
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.reports.couldNotLoadWeeklySnapshots')}
        </Text>
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
