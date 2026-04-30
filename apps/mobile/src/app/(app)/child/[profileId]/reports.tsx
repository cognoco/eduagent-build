import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChildDetail } from '../../../../hooks/use-dashboard';
import {
  useChildReports,
  useChildWeeklyReports,
} from '../../../../hooks/use-progress';
import { goBackOrReplace } from '../../../../lib/navigation';

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
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 10, 0, 0)
  );
  const daysUntil = Math.ceil(
    (nextRun.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
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
  const childName = child?.displayName ?? 'Your child';

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
                  : ('/(app)/dashboard' as const)
              )
            }
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="child-reports-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              Learning reports
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              Weekly snapshots and monthly summaries of your child's progress.
            </Text>
          </View>
        </View>

        {weeklyLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              Loading weekly snapshots...
            </Text>
          </View>
        ) : weeklyError ? (
          <View
            className="bg-surface rounded-card p-4 mt-4"
            testID="weekly-reports-error"
          >
            <Text className="text-body font-semibold text-text-primary">
              Couldn't load weekly snapshots
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => void weeklyRefetch()}
              className="bg-primary rounded-button px-4 py-3 mt-3 items-center min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Retry loading weekly snapshots"
              testID="weekly-reports-error-retry"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Try again
              </Text>
            </Pressable>
          </View>
        ) : weeklyReports && weeklyReports.length > 0 ? (
          <View className="mt-4">
            <Text
              className="text-body font-semibold text-text-primary mb-2"
              testID="weekly-reports-heading"
            >
              Weekly snapshots
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
                accessibilityLabel={`Week of ${new Date(
                  `${report.reportWeek}T00:00:00Z`
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
                      Week of{' '}
                      {new Date(
                        `${report.reportWeek}T00:00:00Z`
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
                        New
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
              Weekly snapshots
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              Weekly snapshots are generated each week once {childName} starts
              learning. Check back soon!
            </Text>
          </View>
        )}

        <Text className="text-body font-semibold text-text-primary mt-4 mb-2">
          Monthly reports
        </Text>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              Loading reports...
            </Text>
          </View>
        ) : isError ? (
          // [EP15-I3] Prior version destructured only `data, isLoading`.
          // On API failure users saw the "no reports yet" empty state and
          // thought their child had no learning activity, when really the
          // server was down. Error must be visually distinct from empty.
          <View
            className="bg-surface rounded-card p-4 mt-4"
            testID="child-reports-error"
          >
            <Text className="text-h3 font-semibold text-text-primary">
              We couldn't load the reports
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              Check your connection and try again.
            </Text>
            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={() => void refetch()}
                className="bg-primary rounded-button px-4 py-3 items-center flex-1 min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel="Retry loading reports"
                testID="child-reports-error-retry"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  Try again
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  goBackOrReplace(
                    router,
                    profileId
                      ? (`/(app)/child/${profileId}` as const)
                      : ('/(app)/dashboard' as const)
                  )
                }
                className="bg-background rounded-button px-4 py-3 items-center flex-1 min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel="Go back"
                testID="child-reports-error-back"
              >
                <Text className="text-body font-semibold text-text-primary">
                  Go back
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
              accessibilityLabel={`Open ${report.reportMonth} report`}
              testID={`report-card-${report.id}`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 me-3">
                  <Text className="text-body font-semibold text-text-primary">
                    {new Date(
                      `${report.reportMonth}T00:00:00Z`
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
                      New
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
            <Text className="text-4xl mb-3">📊</Text>
            <Text className="text-h3 font-semibold text-text-primary text-center">
              Your first report is on its way
            </Text>
            {/* [BUG-904] Empty state previously stacked four near-duplicate
                copies of the same fact ("first report coming soon"). Collapse
                to a single information line + the time context, keep the one
                CTA. The push-notification claim was removed because it isn't
                accurate when the parent has Push Notifications switched off. */}
            {(() => {
              const { date, timeContext } = getNextReportInfo();
              return (
                <Text
                  className="text-body-sm text-text-secondary text-center mt-2"
                  testID="child-reports-empty-time-context"
                >
                  {date
                    ? `${childName}'s first report will arrive on ${date}.`
                    : `${childName}'s first report ${timeContext}.`}
                </Text>
              );
            })()}
            <Pressable
              onPress={() =>
                goBackOrReplace(
                  router,
                  profileId
                    ? (`/(app)/child/${profileId}` as const)
                    : ('/(app)/dashboard' as const)
                )
              }
              className="bg-primary rounded-button px-5 py-3 mt-4 min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={`See ${childName}'s progress now`}
              testID="child-reports-empty-progress"
            >
              <Text className="text-body font-semibold text-text-inverse text-center">
                See {childName}'s progress now
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
