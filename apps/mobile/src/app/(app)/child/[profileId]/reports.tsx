import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChildDetail } from '../../../../hooks/use-dashboard';
import {
  useChildReports,
  useChildWeeklyReports,
} from '../../../../hooks/use-progress';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../../../lib/navigation';
import { useTranslation } from 'react-i18next';

/** Returns the formatted next report date and a human-friendly time context. */
export function getNextReportInfo(now = new Date()): {
  date: string;
  timeContext: string;
} {
  const isFirstOfMonth = now.getUTCDate() === 1;
  const cronHour = 10; // Monthly report cron runs 10:00 UTC on the 1st

  // If it's the 1st and before the cron, report may arrive today
  if (isFirstOfMonth && now.getUTCHours() < cronHour) {
    return { date: '', timeContext: 'should be ready later today' };
  }

  // Next run is the 1st of next month at 10:00 UTC
  const nextRun = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 10, 0, 0),
  );
  const daysUntil = Math.ceil(
    (nextRun.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const formattedDate = nextRun.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const timeContext =
    daysUntil <= 3
      ? 'arrives in a few days'
      : `arrives in about ${daysUntil} days`;

  return { date: formattedDate, timeContext };
}

export default function ChildReportsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId: rawProfileId } = useLocalSearchParams<{
    profileId: string;
  }>();
  // Expo Router can deliver string[] for repeated params — extract scalar
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;
  const { data: child } = useChildDetail(profileId);
  const {
    data: reports,
    isLoading,
    isError,
    refetch,
  } = useChildReports(profileId);
  const {
    data: weeklyReports,
    isLoading: weeklyLoading,
    isError: weeklyError,
    refetch: weeklyRefetch,
  } = useChildWeeklyReports(profileId);
  const childName = child?.displayName ?? t('parentView.index.yourChild');

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() =>
              goBackOrReplace(
                router,
                profileId
                  ? (`/(app)/child/${profileId}` as const)
                  : FAMILY_HOME_PATH,
              )
            }
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="child-reports-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {t('parentView.reports.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {t('parentView.reports.subtitle')}
            </Text>
          </View>
        </View>

        {weeklyLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.reports.loadingWeeklySnapshots')}
            </Text>
          </View>
        ) : weeklyError && !weeklyReports ? (
          <View
            className="bg-surface rounded-card p-4 mt-4"
            testID="weekly-reports-error"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('parentView.reports.couldNotLoadWeeklySnapshots')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {t('parentView.reports.checkConnectionRetry')}
            </Text>
            <Pressable
              onPress={() => void weeklyRefetch()}
              className="bg-primary rounded-button px-4 py-3 mt-3 items-center min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('parentView.reports.retryWeeklySnapshots')}
              testID="weekly-reports-error-retry"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('common.tryAgain')}
              </Text>
            </Pressable>
          </View>
        ) : weeklyReports && weeklyReports.length > 0 ? (
          <View className="mt-4">
            <Text
              className="text-body font-semibold text-text-primary mb-2"
              testID="weekly-reports-heading"
            >
              {t('parentView.reports.weeklySnapshots')}
            </Text>
            {weeklyReports.map((report) => (
              <Pressable
                key={report.id}
                className="bg-surface rounded-card p-4 mb-3"
                testID={`weekly-report-card-${report.id}`}
                onPress={() =>
                  router.push({
                    pathname:
                      '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
                    params: { profileId, weeklyReportId: report.id },
                  } as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`${t(
                  'parentView.reports.weekOf',
                )} ${new Date(
                  `${report.reportWeek}T00:00:00Z`,
                ).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}. ${report.headlineStat.label}: ${
                  report.headlineStat.value
                }`}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 me-3">
                    <Text className="text-body font-semibold text-text-primary">
                      {t('parentView.reports.weekOf')}{' '}
                      {new Date(
                        `${report.reportWeek}T00:00:00Z`,
                      ).toLocaleDateString(undefined, {
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
                  </View>
                  {!report.viewedAt ? (
                    <View className="bg-accent/15 rounded-full px-3 py-1">
                      <Text className="text-caption font-semibold text-accent">
                        {t('parentView.reports.newBadge')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View
            className="bg-surface rounded-card p-4 mt-4"
            testID="weekly-reports-empty"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('parentView.reports.weeklySnapshots')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {t('parentView.reports.weeklySnapshotsEmpty', {
                name: childName,
              })}
            </Text>
          </View>
        )}

        <Text className="text-body font-semibold text-text-primary mt-4 mb-2">
          {t('parentView.reports.monthlyReports')}
        </Text>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.reports.loadingReports')}
            </Text>
          </View>
        ) : isError && !reports ? (
          // [EP15-I3] Prior version destructured only `data, isLoading`.
          // On API failure users saw the "no reports yet" empty state and
          // thought their child had no learning activity, when really the
          // server was down. Error must be visually distinct from empty.
          <View
            className="bg-surface rounded-card p-4 mt-4"
            testID="child-reports-error"
          >
            <Text className="text-h3 font-semibold text-text-primary">
              {t('parentView.reports.couldNotLoadReports')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              {t('parentView.reports.checkConnectionRetry')}
            </Text>
            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={() => void refetch()}
                className="bg-primary rounded-button px-4 py-3 items-center flex-1 min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('parentView.reports.retryReports')}
                testID="child-reports-error-retry"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('common.tryAgain')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  goBackOrReplace(
                    router,
                    profileId
                      ? (`/(app)/child/${profileId}` as const)
                      : FAMILY_HOME_PATH,
                  )
                }
                className="bg-background rounded-button px-4 py-3 items-center flex-1 min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('common.goBack')}
                testID="child-reports-error-back"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('common.goBack')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : reports && reports.length > 0 ? (
          reports.map((report) => (
            <Pressable
              key={report.id}
              onPress={() => {
                if (!profileId) return;
                router.push({
                  pathname: '/(app)/child/[profileId]/report/[reportId]',
                  params: { profileId, reportId: report.id },
                } as never);
              }}
              className="bg-surface rounded-card p-4 mt-4"
              accessibilityRole="button"
              accessibilityLabel={t('parentView.reports.openReport', {
                month: report.reportMonth,
              })}
              testID={`report-card-${report.id}`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 me-3">
                  <Text className="text-body font-semibold text-text-primary">
                    {new Date(
                      `${report.reportMonth}T00:00:00Z`,
                    ).toLocaleDateString(undefined, {
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
                </View>
                {!report.viewedAt ? (
                  <View className="bg-accent/15 rounded-full px-3 py-1">
                    <Text className="text-caption font-semibold text-accent">
                      {t('parentView.reports.newBadge')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))
        ) : (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="child-reports-empty"
          >
            {(() => {
              const { date, timeContext } = getNextReportInfo();
              return (
                <Text
                  className="text-body-sm text-text-secondary text-center"
                  testID="child-reports-empty-time-context"
                >
                  {date
                    ? t('parentView.reports.firstReportArriveOn', {
                        name: childName,
                        date,
                      })
                    : t('parentView.reports.firstReportTimeContext', {
                        name: childName,
                        timeContext,
                      })}
                </Text>
              );
            })()}
            <Pressable
              onPress={() =>
                goBackOrReplace(
                  router,
                  profileId
                    ? (`/(app)/child/${profileId}` as const)
                    : FAMILY_HOME_PATH,
                )
              }
              className="bg-primary rounded-button px-5 py-3 mt-4 min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('parentView.reports.seeProgressNow', {
                name: childName,
              })}
              testID="child-reports-empty-progress"
            >
              <Text className="text-body font-semibold text-text-inverse text-center">
                {t('parentView.reports.seeProgressNow', { name: childName })}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
