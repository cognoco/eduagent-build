import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WeeklyReportSummary } from '@eduagent/schemas';
import { useChildDetail } from '../../../../hooks/use-dashboard';
import {
  useChildReports,
  useChildWeeklyReports,
} from '../../../../hooks/use-progress';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../../../lib/navigation';
import { useTranslation } from 'react-i18next';
import { ReportsList } from '../../../../components/progress/ReportsList';

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

function formatReportWeek(reportWeek: string): string {
  const start = new Date(`${reportWeek}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 'Latest week';
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${startLabel} – ${endLabel}`;
}

function ReportsHeaderSummary({
  latestReport,
}: {
  latestReport: WeeklyReportSummary | undefined;
}): React.ReactElement | null {
  const { t } = useTranslation();
  if (!latestReport?.headlineStat) return null;
  const { headlineStat, thisWeek } = latestReport;
  return (
    <View
      testID="reports-header-summary"
      className="bg-coaching-card rounded-card p-5 mt-4"
    >
      <Text className="text-caption text-text-secondary">
        {formatReportWeek(latestReport.reportWeek)}
      </Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {headlineStat.label}: {headlineStat.value}
      </Text>
      {headlineStat.comparison ? (
        <Text className="text-body-sm text-text-secondary mt-1">
          {headlineStat.comparison}
        </Text>
      ) : null}
      {thisWeek ? (
        <View className="flex-row flex-wrap mt-3" style={{ gap: 18 }}>
          <View>
            <Text className="text-caption text-text-secondary">
              {t('parentView.weeklyReport.sessionsThisWeek')}
            </Text>
            <Text className="text-body font-semibold text-text-primary mt-1">
              {thisWeek.totalSessions}
            </Text>
          </View>
          <View>
            <Text className="text-caption text-text-secondary">
              {t('parentView.weeklyReport.timeOnApp')}
            </Text>
            <Text className="text-body font-semibold text-text-primary mt-1">
              {thisWeek.totalActiveMinutes} min
            </Text>
          </View>
          <View>
            <Text className="text-caption text-text-secondary">
              {t('parentView.weeklyReport.topicsMastered')}
            </Text>
            <Text className="text-body font-semibold text-text-primary mt-1">
              {thisWeek.topicsMastered}
            </Text>
          </View>
          <View>
            <Text className="text-caption text-text-secondary">
              {t('parentView.weeklyReport.totalWordsKnown')}
            </Text>
            <Text className="text-body font-semibold text-text-primary mt-1">
              {thisWeek.vocabularyTotal}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
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
  const [selectedWeeklyReportId, setSelectedWeeklyReportId] = useState<
    string | null
  >(null);

  const combinedLoading = isLoading || weeklyLoading;
  const hasAnyData =
    (reports?.length ?? 0) > 0 || (weeklyReports?.length ?? 0) > 0;
  // [CCR finding, 2026-05-14] Prior version was `!hasAnyData && isError`,
  // which silently swallowed weekly-only failures: weekly down + monthly up
  // showed neither an error banner nor a retry path. The retry handler
  // already calls both refetches, so widening this condition is sufficient.
  const combinedError = !hasAnyData && (isError || weeklyError);
  const latestWeeklyReport = weeklyReports?.[0];
  const selectedWeeklyReport = useMemo(() => {
    if (!weeklyReports?.length) return undefined;
    return (
      weeklyReports.find((report) => report.id === selectedWeeklyReportId) ??
      latestWeeklyReport
    );
  }, [latestWeeklyReport, selectedWeeklyReportId, weeklyReports]);
  const remainingWeeklyReports = useMemo(
    () =>
      (weeklyReports ?? []).filter(
        (report) => report.id !== selectedWeeklyReport?.id,
      ),
    [selectedWeeklyReport?.id, weeklyReports],
  );
  const hasOtherReports =
    remainingWeeklyReports.length > 0 || (reports?.length ?? 0) > 0;
  const isViewingLatestWeeklyReport =
    !!selectedWeeklyReport &&
    selectedWeeklyReport.id === latestWeeklyReport?.id;

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
            <Text className="text-body font-semibold text-primary">{'←'}</Text>
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

        <ReportsHeaderSummary latestReport={selectedWeeklyReport} />
        {selectedWeeklyReport && !isViewingLatestWeeklyReport ? (
          <Pressable
            onPress={() =>
              setSelectedWeeklyReportId(latestWeeklyReport?.id ?? null)
            }
            className="self-start mt-3 px-1 py-2"
            accessibilityRole="button"
            accessibilityLabel={t('parentView.reports.backToLatest')}
            testID="child-reports-back-to-latest"
          >
            <Text className="text-body-sm font-semibold text-primary">
              {t('parentView.reports.backToLatest')}
            </Text>
          </Pressable>
        ) : null}

        {combinedLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.reports.loadingReports')}
            </Text>
          </View>
        ) : combinedError ? (
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
                onPress={() => {
                  void refetch();
                  void weeklyRefetch();
                }}
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
        ) : hasAnyData && hasOtherReports ? (
          <View className="mt-4">
            <ReportsList
              monthlyReports={reports ?? []}
              weeklyReports={remainingWeeklyReports}
              onPressMonthly={(reportId) => {
                if (!profileId) return;
                router.push({
                  pathname: '/(app)/child/[profileId]/report/[reportId]',
                  params: { profileId, reportId },
                } as Href);
              }}
              onPressWeekly={(reportId) => {
                setSelectedWeeklyReportId(reportId);
              }}
              showNewBadge
            />
          </View>
        ) : (
          <View
            className="bg-surface rounded-card p-4 mt-4 items-center"
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
