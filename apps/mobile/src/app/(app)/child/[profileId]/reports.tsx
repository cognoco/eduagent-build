import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
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
import { formatShortDate } from '../../../../lib/format-datetime';

/** Returns the formatted next report date and a human-friendly time context. */
export function getNextReportInfo(
  now = new Date(),
  locale?: string,
): {
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
  const formattedDate = formatShortDate(nextRun, locale, {
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

function formatReportWeek(
  reportWeek: string,
  fallback: string,
  locale: string | undefined,
): string {
  const start = new Date(`${reportWeek}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return fallback;
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  const startLabel = formatShortDate(start, locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = formatShortDate(end, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${startLabel} – ${endLabel}`;
}

function ReportsHeaderSummary({
  latestReport,
  showNewBadge = false,
}: {
  latestReport: WeeklyReportSummary | undefined;
  showNewBadge?: boolean;
}): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  if (!latestReport?.headlineStat) return null;
  const { headlineStat, thisWeek } = latestReport;
  return (
    <View
      testID="reports-header-summary"
      className="bg-coaching-card rounded-card p-5 mt-4"
    >
      <View className="flex-row items-start justify-between">
        <Text className="text-caption text-text-secondary flex-1 me-3">
          {formatReportWeek(
            latestReport.reportWeek,
            t('guardian.latestWeekFallback'),
            i18n.language,
          )}
        </Text>
        {showNewBadge ? (
          <View
            className="bg-accent/15 rounded-full px-3 py-1"
            testID="parentView.reports.newBadge"
          >
            <Text className="text-caption font-semibold text-accent">
              {t('parentView.reports.newBadge')}
            </Text>
          </View>
        ) : null}
      </View>
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
              {t('parentView.weeklyReport.activeMinutes', {
                count: thisWeek.totalActiveMinutes,
              })}
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

// Sentinel item used so FlatList always has at least one item to render the
// body content (loading, error, empty, or the ReportsList) via renderItem.
const BODY_SENTINEL = [{ key: 'body' }] as const;

export default function ChildReportsScreen(): React.ReactElement {
  const { t, i18n } = useTranslation();
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
  const hasUnviewedWeeklyReport = (weeklyReports ?? []).some(
    (report) => !report.viewedAt,
  );

  const listHeader = (
    <View>
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
          className="me-3 min-h-[44px] min-w-[44px] items-center justify-center"
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

      <ReportsHeaderSummary
        latestReport={selectedWeeklyReport}
        showNewBadge={isViewingLatestWeeklyReport && hasUnviewedWeeklyReport}
      />
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
    </View>
  );

  // Body content rendered as a single FlatList item to keep the header
  // and body in one scrollable surface without double-virtualization.
  // ReportsList uses scrollEnabled={false} since the outer FlatList scrolls.
  const renderBody = () => {
    if (combinedLoading) {
      return (
        <View className="bg-surface rounded-card p-4 mt-4">
          <Text className="text-body-sm text-text-secondary">
            {t('parentView.reports.loadingReports')}
          </Text>
        </View>
      );
    }
    if (combinedError) {
      // [EP15-I3] Prior version destructured only `data, isLoading`.
      // On API failure users saw the "no reports yet" empty state and
      // thought their child had no learning activity, when really the
      // server was down. Error must be visually distinct from empty.
      return (
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
      );
    }
    if (hasAnyData && hasOtherReports) {
      return (
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
              if (!profileId) return;
              router.push({
                pathname:
                  '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
                params: { profileId, weeklyReportId: reportId },
              } as Href);
            }}
            showNewBadge
            newReportId={latestWeeklyReport ? null : undefined}
            scrollEnabled={false}
          />
        </View>
      );
    }
    if (hasAnyData) return null;
    return (
      <View
        className="bg-surface rounded-card p-4 mt-4 items-center"
        testID="child-reports-empty"
      >
        {(() => {
          const { date, timeContext } = getNextReportInfo(
            new Date(),
            i18n.language,
          );
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
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FlatList
        className="flex-1 px-5"
        data={BODY_SENTINEL}
        keyExtractor={(item) => item.key}
        renderItem={renderBody}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        initialNumToRender={1}
        removeClippedSubviews={false}
      />
    </View>
  );
}
