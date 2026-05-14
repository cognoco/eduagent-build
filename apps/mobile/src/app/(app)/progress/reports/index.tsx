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
import { ReportsList } from '../../../../components/progress/ReportsList';

export default function ProgressReportsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const monthlyReports = useProfileReports(activeProfile?.id);
  const weeklyReports = useProfileWeeklyReports(activeProfile?.id);

  const isLoading = monthlyReports.isLoading || weeklyReports.isLoading;
  const hasData =
    (monthlyReports.data?.length ?? 0) > 0 ||
    (weeklyReports.data?.length ?? 0) > 0;
  const isError = !hasData && (monthlyReports.isError || weeklyReports.isError);

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
            <Text className="text-body font-semibold text-primary">{'←'}</Text>
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
        ) : (
          <View className="mt-4" testID="progress-reports-list">
            <ReportsList
              monthlyReports={monthlyReports.data ?? []}
              weeklyReports={weeklyReports.data ?? []}
              onPressMonthly={(reportId) =>
                router.push({
                  pathname: '/(app)/progress/reports/[reportId]',
                  params: { reportId },
                } as Href)
              }
              onPressWeekly={(reportId) =>
                router.push({
                  pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
                  params: { weeklyReportId: reportId },
                } as Href)
              }
              testID="progress-report-rows"
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
