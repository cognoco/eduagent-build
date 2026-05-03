import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { goBackOrReplace } from '../../../../../lib/navigation';
import { classifyApiError } from '../../../../../lib/format-api-error';
import { ErrorFallback } from '../../../../../components/common';
import {
  useChildReportDetail,
  useMarkChildReportViewed,
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

export default function ChildReportDetailScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId, reportId } = useLocalSearchParams<{
    profileId: string;
    reportId: string;
  }>();
  // UX-DE-M6: isError branch + contextual back
  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = useChildReportDetail(profileId, reportId);

  const reportsHref = profileId
    ? (`/(app)/child/${profileId}/reports` as const)
    : ('/(app)/dashboard' as const);
  const markViewed = useMarkChildReportViewed();
  const markViewedRef = useRef(markViewed);
  markViewedRef.current = markViewed;
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!profileId || !reportId || !report || report.viewedAt) return;
    // [BUG-550] Guard: fire at most once per mount to prevent retry flood.
    // useMutation returns a new object reference each render, so we access it
    // via a ref to keep a stable dependency array.
    if (viewedRef.current) return;
    viewedRef.current = true;
    // [EP15-C7] Mark-viewed is best-effort background tracking — a failure
    // should not interrupt the user's read, but we capture to Sentry for
    // observability instead of swallowing silently with `void`.
    markViewedRef.current
      .mutateAsync({ childProfileId: profileId, reportId })
      .catch((err: unknown) => {
        Sentry.captureException(err, {
          tags: { feature: 'monthly_report', action: 'mark_viewed' },
          extra: { profileId, reportId },
        });
      });
  }, [profileId, report, reportId]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          {/* UX-DE-M6: contextual back — was /(app)/more, now goes to child reports */}
          <Pressable
            onPress={() => goBackOrReplace(router, reportsHref)}
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="child-report-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {report?.reportData.month ?? 'Monthly report'}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              Progress you can see and share.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              Loading report...
            </Text>
          </View>
        ) : isError ? (
          // UX-DE-M6: network failures must not silently render as the gone state
          <ErrorFallback
            variant="card"
            message={classifyApiError(error).message}
            primaryAction={{
              label: 'Try Again',
              onPress: () => void refetch(),
              testID: 'child-report-error-retry',
            }}
            secondaryAction={{
              label: 'Back to reports',
              onPress: () => goBackOrReplace(router, reportsHref),
              testID: 'child-report-error-back',
            }}
            testID="child-report-error"
          />
        ) : report ? (
          <>
            <View
              className="bg-coaching-card rounded-card p-5 mt-4"
              testID="child-report-hero"
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
                label="Sessions"
                value={String(report.reportData.thisMonth.totalSessions)}
                testID="child-report-metric-sessions"
              />
              <MetricCard
                label="Time on app"
                value={String(report.reportData.thisMonth.totalActiveMinutes)}
                testID="child-report-metric-minutes"
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <MetricCard
                label="Topics mastered"
                value={String(report.reportData.thisMonth.topicsMastered)}
                testID="child-report-metric-topics"
              />
              {/* [EP15-I2] Field renamed from vocabularyLearned to
                  vocabularyTotal — it's cumulative, not per-month delta.
                  "Words learned" was misleading; use "Total words". */}
              <MetricCard
                label="Total words"
                value={String(report.reportData.thisMonth.vocabularyTotal)}
                testID="child-report-metric-vocabulary"
              />
            </View>

            {report.reportData.highlights.length > 0 ? (
              <View
                className="bg-surface rounded-card p-4 mt-4"
                testID="child-report-highlights"
              >
                <Text className="text-h3 font-semibold text-text-primary">
                  Highlights
                </Text>
                <View className="mt-3 gap-2">
                  {report.reportData.highlights.map((highlight) => (
                    <Text
                      key={highlight}
                      className="text-body-sm text-text-secondary"
                    >
                      • {highlight}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {report.reportData.nextSteps.length > 0 ? (
              <View
                className="bg-surface rounded-card p-4 mt-4"
                testID="child-report-next-steps"
              >
                <Text className="text-h3 font-semibold text-text-primary">
                  What's next
                </Text>
                <View className="mt-3 gap-2">
                  {report.reportData.nextSteps.map((step) => (
                    <Text
                      key={step}
                      className="text-body-sm text-text-secondary"
                    >
                      • {step}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            <View
              className="bg-surface rounded-card p-4 mt-4"
              testID="child-report-subjects"
            >
              <Text className="text-h3 font-semibold text-text-primary">
                Subject breakdown
              </Text>
              <View className="mt-3 gap-3">
                {report.reportData.subjects.map((subject) => (
                  <View
                    key={subject.subjectName}
                    className="bg-background rounded-card p-4"
                  >
                    <Text className="text-body font-semibold text-text-primary">
                      {subject.subjectName}
                    </Text>
                    <Text className="text-body-sm text-text-secondary mt-1">
                      {subject.topicsMastered} topics mastered •{' '}
                      {subject.vocabularyTotal} words known •{' '}
                      {subject.activeMinutes} min on app
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          // [EP15-I4] Dead-end fix: prior "no longer available" branch
          // had zero interactive elements, leaving users with only the
          // OS back gesture. Adds an explicit back-to-reports Pressable.
          <View
            className="bg-surface rounded-card p-5 mt-4"
            testID="child-report-gone"
          >
            <Text className="text-h3 font-semibold text-text-primary">
              This report is no longer available
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              It may have been archived or removed. All your other reports are
              still safe.
            </Text>
            <Pressable
              onPress={() => goBackOrReplace(router, reportsHref)}
              className="bg-primary rounded-button px-4 py-3 items-center mt-4 min-h-[48px] justify-center"
              accessibilityRole="button"
              accessibilityLabel="Back to reports"
              testID="child-report-gone-back"
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
