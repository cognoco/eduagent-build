import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProfileReports } from '../../hooks/use-progress';

type ReportingComponentProps = {
  profileId: string;
  title?: string;
};

function formatMonth(reportMonth: string): string {
  return new Date(`${reportMonth}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function MonthlyReportCard({
  profileId,
  title,
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const reportsQuery = useProfileReports(profileId);
  const latest = reportsQuery.data?.[0];

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
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.reports.couldNotLoadReports')}
        </Text>
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
        </View>
      ) : (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.index.firstReportSoon')}
        </Text>
      )}
    </View>
  );
}
