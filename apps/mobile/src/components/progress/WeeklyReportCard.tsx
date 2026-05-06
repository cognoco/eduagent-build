import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProfileWeeklyReports } from '../../hooks/use-progress';

type ReportingComponentProps = {
  profileId: string;
  title?: string;
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
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const reportsQuery = useProfileWeeklyReports(profileId);
  const latest = reportsQuery.data?.[0];

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
      ) : (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.reports.weeklySnapshotsEmpty', {
            name: t('parentView.index.yourChild'),
          })}
        </Text>
      )}
    </View>
  );
}
