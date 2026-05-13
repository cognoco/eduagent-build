import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  useProfileReports,
  useProfileWeeklyReports,
} from '../../../../hooks/use-progress';
import { goBackOrReplace } from '../../../../lib/navigation';
import { useProfile } from '../../../../lib/profile';
import { ErrorFallback } from '../../../../components/common';

function formatDateOnly(
  isoDate: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    ...options,
    timeZone: 'UTC',
  });
}

export default function ProgressReportsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const monthlyReports = useProfileReports(activeProfile?.id);
  const weeklyReports = useProfileWeeklyReports(activeProfile?.id);
  const items = [
    ...(weeklyReports.data ?? []).map((report) => ({
      kind: 'weekly' as const,
      id: report.id,
      date: report.reportWeek,
      title: `${t('parentView.reports.weekOf')} ${formatDateOnly(
        report.reportWeek,
        { month: 'short', day: 'numeric' },
      )}`,
      headlineStat: report.headlineStat,
    })),
    ...(monthlyReports.data ?? []).map((report) => ({
      kind: 'monthly' as const,
      id: report.id,
      date: report.reportMonth,
      title: formatDateOnly(report.reportMonth, {
        month: 'long',
        year: 'numeric',
      }),
      headlineStat: report.headlineStat,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const isLoading = monthlyReports.isLoading || weeklyReports.isLoading;
  const isError =
    items.length === 0 && (monthlyReports.isError || weeklyReports.isError);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/progress')}
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="progress-reports-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {t('progress.previousReports.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {t('progress.previousReports.subtitle')}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.reports.loadingReports')}
            </Text>
          </View>
        ) : isError ? (
          <ErrorFallback
            variant="card"
            message={t('parentView.reports.checkConnectionRetry')}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => {
                void monthlyReports.refetch();
                void weeklyReports.refetch();
              },
              testID: 'progress-reports-retry',
            }}
            secondaryAction={{
              label: t('common.goBack'),
              onPress: () => goBackOrReplace(router, '/(app)/progress'),
              testID: 'progress-reports-back-secondary',
            }}
            testID="progress-reports-error"
          />
        ) : items.length > 0 ? (
          items.map((item) => (
            <Pressable
              key={`${item.kind}-${item.id}`}
              onPress={() =>
                item.kind === 'weekly'
                  ? router.push({
                      pathname:
                        '/(app)/progress/weekly-report/[weeklyReportId]',
                      params: { weeklyReportId: item.id },
                    } as Href)
                  : router.push({
                      pathname: '/(app)/progress/reports/[reportId]',
                      params: { reportId: item.id },
                    } as Href)
              }
              className="bg-surface rounded-card p-4 mt-4"
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.headlineStat.label}: ${item.headlineStat.value}`}
              testID={`progress-report-row-${item.id}`}
            >
              <Text className="text-body font-semibold text-text-primary">
                {item.title}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                {item.headlineStat.label}: {item.headlineStat.value}
              </Text>
              <Text className="text-caption text-text-secondary mt-1">
                {item.headlineStat.comparison}
              </Text>
            </Pressable>
          ))
        ) : (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.index.firstReportSoon')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
