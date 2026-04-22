import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { goBackOrReplace } from '../../../../../lib/navigation';
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

export default function ChildWeeklyReportDetailScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId, weeklyReportId } = useLocalSearchParams<{
    profileId: string;
    weeklyReportId: string;
  }>();
  const { data: report, isLoading } = useChildWeeklyReportDetail(
    profileId,
    weeklyReportId
  );
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
                  : ('/(app)/dashboard' as const)
              )
            }
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="child-weekly-report-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {report
                ? `Week of ${new Date(
                    `${report.reportData.weekStart}T00:00:00Z`
                  ).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : 'Weekly report'}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              A snapshot of this week&apos;s learning.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              Loading report...
            </Text>
          </View>
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
                label="Sessions this week"
                value={String(report.reportData.thisWeek.totalSessions)}
                testID="child-weekly-report-metric-sessions"
              />
              <MetricCard
                label="Active minutes"
                value={String(report.reportData.thisWeek.totalActiveMinutes)}
                testID="child-weekly-report-metric-minutes"
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <MetricCard
                label="Topics mastered"
                value={String(report.reportData.thisWeek.topicsMastered)}
                testID="child-weekly-report-metric-topics"
              />
              {/* [SUGG-1] vocabularyTotal is cumulative (absolute snapshot),
                  not a weekly delta — label reflects that. */}
              <MetricCard
                label="Total words known"
                value={String(report.reportData.thisWeek.vocabularyTotal)}
                testID="child-weekly-report-metric-vocabulary"
              />
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
              This report is no longer available
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              It may have been archived or removed. All your other reports are
              still safe.
            </Text>
            <Pressable
              onPress={() => {
                if (profileId) {
                  router.replace({
                    pathname: '/(app)/child/[profileId]/reports',
                    params: { profileId },
                  } as never);
                } else {
                  router.replace('/(app)/dashboard' as never);
                }
              }}
              className="bg-primary rounded-button px-4 py-3 items-center mt-4 min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Back to reports"
              testID="child-weekly-report-gone-back"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Back to reports
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
