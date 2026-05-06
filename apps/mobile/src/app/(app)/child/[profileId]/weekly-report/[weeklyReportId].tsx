import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react-native';
import {
  FAMILY_HOME_PATH,
  goBackOrReplace,
} from '../../../../../lib/navigation';
import { classifyApiError } from '../../../../../lib/format-api-error';
import { ErrorFallback } from '../../../../../components/common';
import {
  useChildWeeklyReportDetail,
  useMarkWeeklyReportViewed,
} from '../../../../../hooks/use-progress';

function MetricCard({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}): React.ReactElement {
  return (
    <View className="bg-background rounded-card p-4 flex-1" testID={testID}>
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {value}
      </Text>
    </View>
  );
}

/**
 * BUG-903 (c): Render a "Apr 27 – May 3, 2026" date range so the parent sees
 * the full week rather than just the week-start date.
 *
 * weekStart is an ISO date string (YYYY-MM-DD) representing the first day of
 * the report week. The end day is +6 days (inclusive 7-day window).
 */
function formatWeeklyReportRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 'Weekly report';
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

/**
 * BUG-903 (d): Detect a fully-empty report so the screen can show friendly
 * empty-state copy and skip meaningless metric cards / "up from 0" lines.
 */
function isEmptyWeeklyReport(reportData: {
  thisWeek: {
    totalSessions: number;
    totalActiveMinutes: number;
    topicsMastered: number;
    vocabularyTotal: number;
  };
}): boolean {
  return (
    reportData.thisWeek.totalSessions === 0 &&
    reportData.thisWeek.totalActiveMinutes === 0 &&
    reportData.thisWeek.topicsMastered === 0 &&
    reportData.thisWeek.vocabularyTotal === 0
  );
}

export default function ChildWeeklyReportDetailScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId, weeklyReportId } = useLocalSearchParams<{
    profileId: string;
    weeklyReportId: string;
  }>();
  // UX-DE-M6: add isError + error + refetch so network failures do not silently render as gone state
  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = useChildWeeklyReportDetail(profileId, weeklyReportId);

  const reportsHref = profileId
    ? (`/(app)/child/${profileId}/reports` as const)
    : FAMILY_HOME_PATH;
  const markViewed = useMarkWeeklyReportViewed();
  const markViewedRef = useRef(markViewed);
  markViewedRef.current = markViewed;
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!profileId || !weeklyReportId || !report || report.viewedAt) return;
    // Guard: fire at most once per mount to prevent retry flood.
    // useMutation returns a new object reference each render, so we access it
    // via a ref to keep a stable dependency array.
    if (viewedRef.current) return;
    viewedRef.current = true;
    // [SUGG-4] Mark-viewed is best-effort background tracking — a failure
    // should not interrupt the user's read, but we capture to Sentry for
    // observability instead of swallowing silently with `void`.
    markViewedRef.current
      .mutateAsync({ childProfileId: profileId, reportId: weeklyReportId })
      .catch((err: unknown) => {
        Sentry.captureException(err, {
          tags: { feature: 'weekly_report', action: 'mark_viewed' },
          extra: { profileId, reportId: weeklyReportId },
        });
      });
  }, [profileId, report, weeklyReportId]);

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
                  ? (`/(app)/child/${profileId}/reports` as const)
                  : FAMILY_HOME_PATH
              )
            }
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
            testID="child-weekly-report-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {report
                ? formatWeeklyReportRange(report.reportData.weekStart)
                : t('parentView.weeklyReport.weeklyReport')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {t('parentView.weeklyReport.subtitle')}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              {t('parentView.weeklyReport.loadingReport')}
            </Text>
          </View>
        ) : isError ? (
          // UX-DE-M6: distinct error state — network failures must not silently render as the gone state
          <ErrorFallback
            variant="card"
            message={classifyApiError(error).message}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void refetch(),
              testID: 'child-weekly-report-error-retry',
            }}
            secondaryAction={{
              label: t('parentView.weeklyReport.backToReports'),
              onPress: () => goBackOrReplace(router, reportsHref),
              testID: 'child-weekly-report-error-back',
            }}
            testID="child-weekly-report-error"
          />
        ) : report ? (
          <>
            <View
              className="bg-coaching-card rounded-card p-5 mt-4"
              testID="child-weekly-report-hero"
            >
              <Text className="text-caption text-text-secondary">
                {report.reportData.childName}
              </Text>
              <Text className="text-h1 font-bold text-text-primary mt-2">
                {report.reportData.headlineStat.value}{' '}
                {report.reportData.headlineStat.label.toLowerCase()}
              </Text>
              <Text className="text-body text-text-secondary mt-2">
                {report.reportData.headlineStat.comparison}
              </Text>
            </View>

            <View className="flex-row gap-3 mt-4">
              <MetricCard
                label={t('parentView.weeklyReport.sessionsThisWeek')}
                value={String(report.reportData.thisWeek.totalSessions)}
                testID="child-weekly-report-metric-sessions"
              />
              <MetricCard
                label={t('parentView.weeklyReport.timeOnApp')}
                value={String(report.reportData.thisWeek.totalActiveMinutes)}
                testID="child-weekly-report-metric-minutes"
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <MetricCard
                label={t('parentView.weeklyReport.topicsMastered')}
                value={String(report.reportData.thisWeek.topicsMastered)}
                testID="child-weekly-report-metric-topics"
              />
              {/* [SUGG-1] vocabularyTotal is cumulative (absolute snapshot),
                  not a weekly delta — label reflects that. */}
              <MetricCard
                label={t('parentView.weeklyReport.totalWordsKnown')}
                value={String(report.reportData.thisWeek.vocabularyTotal)}
                testID="child-weekly-report-metric-vocabulary"
              />
            </View>

            {/* BUG-903 (d): Empty-state guidance when nothing happened this */}
            {/* week. Without this, parents see four zero cards and stop. */}
            {isEmptyWeeklyReport(report.reportData) && (
              <View
                className="bg-surface rounded-card p-4 mt-4"
                testID="child-weekly-report-empty-note"
              >
                <Text className="text-body-sm text-text-secondary">
                  {t('parentView.weeklyReport.noActivityNote', {
                    name: report.reportData.childName,
                  })}
                </Text>
              </View>
            )}

            {/* BUG-903 (b): Always provide at least one CTA so the report */}
            {/* is never a true dead-end. Parent can jump back to the child */}
            {/* dashboard to suggest a topic or send a nudge. */}
            <View className="mt-5" testID="child-weekly-report-ctas">
              <Pressable
                onPress={() => {
                  if (!profileId) return;
                  router.push(`/(app)/child/${profileId}` as never);
                }}
                className="bg-primary rounded-button px-4 py-3 items-center min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t(
                  'parentView.weeklyReport.openChildProfile',
                  {
                    name: report.reportData.childName,
                  }
                )}
                testID="child-weekly-report-open-child"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {isEmptyWeeklyReport(report.reportData)
                    ? t('parentView.weeklyReport.sendNudge', {
                        name: report.reportData.childName,
                      })
                    : t('parentView.weeklyReport.openChildProfile', {
                        name: report.reportData.childName,
                      })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => goBackOrReplace(router, reportsHref)}
                className="rounded-button px-4 py-3 items-center min-h-[48px] justify-center mt-2"
                accessibilityRole="button"
                accessibilityLabel={t(
                  'parentView.weeklyReport.backToAllReports'
                )}
                testID="child-weekly-report-back-to-reports"
              >
                <Text className="text-body font-semibold text-primary">
                  {t('parentView.weeklyReport.backToAllReports')}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          // Dead-end fix: "gone" branch must have at least one interactive
          // element so users are never stranded with only the OS back gesture.
          <View
            className="bg-surface rounded-card p-5 mt-4"
            testID="child-weekly-report-gone"
          >
            <Text className="text-h3 font-semibold text-text-primary">
              {t('parentView.weeklyReport.reportGoneTitle')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              {t('parentView.weeklyReport.reportGoneBody')}
            </Text>
            <Pressable
              onPress={() => goBackOrReplace(router, reportsHref)}
              className="bg-primary rounded-button px-4 py-3 items-center mt-4 min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('parentView.weeklyReport.backToReports')}
              testID="child-weekly-report-gone-back"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('parentView.weeklyReport.backToReports')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
