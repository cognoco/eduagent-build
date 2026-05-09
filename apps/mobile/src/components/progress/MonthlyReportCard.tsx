import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProfileReports } from '../../hooks/use-progress';
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

export function MonthlyReportCard({
  profileId,
  title,
  register = 'adult',
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const reportsQuery = useProfileReports(profileId);
  const latest = reportsQuery.data?.[0];
  const highlights = latest?.highlights?.slice(0, 3) ?? [];
  const nextSteps = latest?.nextSteps?.slice(0, 2) ?? [];

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
          <ReportLines
            title={t('progress.monthlyReport.highlightsTitle')}
            lines={highlights}
          />
          <ReportLines
            title={t('progress.monthlyReport.nextStepsTitle')}
            lines={nextSteps}
          />
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
