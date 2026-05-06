import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../lib/profile';
import {
  useProfileReports,
  useProfileWeeklyReports,
} from '../../hooks/use-progress';

type ReportingComponentProps = {
  profileId: string;
};

function formatDateOnly(isoDate: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(
    undefined,
    options
  );
}

export function ReportsListCard({
  profileId,
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const weeklyReports = useProfileWeeklyReports(profileId);
  const monthlyReports = useProfileReports(profileId);
  const isActiveProfile = activeProfile?.id === profileId;

  return (
    <View className="bg-surface rounded-card p-4 mt-6" testID="reports-list">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-body font-semibold text-text-primary">
          {t('parentView.reports.weeklySnapshots')}
        </Text>
        {!isActiveProfile ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/child/[profileId]/reports',
                params: { profileId },
              } as never)
            }
            accessibilityRole="button"
            accessibilityLabel={t('parentView.index.openMonthlyReports')}
            testID="child-reports-link"
          >
            <Text className="text-body-sm text-primary font-semibold">
              {t('progress.milestones.seeAllLink')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {weeklyReports.isLoading || monthlyReports.isLoading ? (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('parentView.reports.loadingReports')}
        </Text>
      ) : weeklyReports.isError || monthlyReports.isError ? (
        <View className="mt-2" testID="reports-list-error">
          <Text className="text-body-sm text-text-secondary">
            {t('parentView.reports.checkConnectionRetry')}
          </Text>
          <Pressable
            onPress={() => {
              void weeklyReports.refetch();
              void monthlyReports.refetch();
            }}
            className="bg-primary rounded-button px-4 py-3 mt-3 items-center min-h-[48px] justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain')}
            testID="reports-list-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
        </View>
      ) : (weeklyReports.data?.length ?? 0) > 0 ? (
        weeklyReports.data?.slice(0, 3).map((report) => (
          <Pressable
            key={report.id}
            disabled={isActiveProfile}
            className={`bg-background rounded-card p-3 mt-3${
              isActiveProfile ? '' : ''
            }`}
            testID={`weekly-report-card-${report.id}`}
            onPress={() =>
              router.push({
                pathname:
                  '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
                params: { profileId, weeklyReportId: report.id },
              } as never)
            }
            accessibilityRole={isActiveProfile ? undefined : 'button'}
            accessibilityLabel={`${t(
              'parentView.reports.weekOf'
            )} ${formatDateOnly(report.reportWeek, {
              month: 'short',
              day: 'numeric',
            })}. ${report.headlineStat.label}: ${report.headlineStat.value}`}
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('parentView.reports.weekOf')}{' '}
              {formatDateOnly(report.reportWeek, {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {report.headlineStat.label}: {report.headlineStat.value}
            </Text>
            <Text className="text-caption text-text-secondary mt-1">
              {report.headlineStat.comparison}
            </Text>
          </Pressable>
        ))
      ) : (monthlyReports.data?.length ?? 0) > 0 ? (
        monthlyReports.data?.slice(0, 3).map((report) => (
          <Pressable
            key={report.id}
            disabled={isActiveProfile}
            className="bg-background rounded-card p-3 mt-3"
            testID={`report-card-${report.id}`}
            onPress={() =>
              router.push({
                pathname: '/(app)/child/[profileId]/report/[reportId]',
                params: { profileId, reportId: report.id },
              } as never)
            }
            accessibilityRole={isActiveProfile ? undefined : 'button'}
            accessibilityLabel={t('parentView.reports.openReport', {
              month: report.reportMonth,
            })}
          >
            <Text className="text-body font-semibold text-text-primary">
              {formatDateOnly(report.reportMonth, {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {report.headlineStat.label}: {report.headlineStat.value}
            </Text>
            <Text className="text-caption text-text-secondary mt-1">
              {report.headlineStat.comparison}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text
          className="text-body-sm text-text-secondary mt-2"
          testID="reports-list-empty"
        >
          {t('parentView.index.firstReportSoon')}
        </Text>
      )}
    </View>
  );
}
