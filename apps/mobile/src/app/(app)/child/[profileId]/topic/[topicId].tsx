import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useChildSessions } from '../../../../../hooks/use-dashboard';
import { goBackOrReplace } from '../../../../../lib/navigation';
import {
  getParentRetentionInfo,
  getReconciliationLine,
  getUnderstandingLabel,
} from '../../../../../lib/parent-vocab';
import { useThemeColors } from '../../../../../lib/theme';
import { MetricInfoDot } from '../../../../../components/parent/MetricInfoDot';

const COMPLETION_STATUS_KEYS: Record<string, string> = {
  not_started: 'parentView.topic.completionStatus.notStarted',
  in_progress: 'parentView.topic.completionStatus.inProgress',
  completed: 'parentView.topic.completionStatus.completed',
  verified: 'parentView.topic.completionStatus.verified',
  stable: 'parentView.topic.completionStatus.stable',
};

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '--';
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

function formatTimeOnApp(
  seconds: number | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const duration = formatDuration(seconds);
  return duration === '--'
    ? t('parentView.topic.timeOnAppUnavailable')
    : t('parentView.topic.timeOnApp', { duration });
}

export default function TopicDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    topicId: rawTopicId,
    profileId: rawProfileId,
    title,
    completionStatus,
    masteryScore,
    retentionStatus,
    totalSessions: rawTotalSessions,
    subjectId: rawSubjectId,
    subjectName: rawSubjectName,
  } = useLocalSearchParams<{
    topicId: string;
    profileId: string;
    title: string;
    completionStatus: string;
    masteryScore: string;
    retentionStatus: string;
    totalSessions: string;
    subjectId: string;
    subjectName: string;
  }>();
  const topicId = Array.isArray(rawTopicId) ? rawTopicId[0] : rawTopicId;
  const profileId = Array.isArray(rawProfileId)
    ? rawProfileId[0]
    : rawProfileId;
  const subjectId = Array.isArray(rawSubjectId)
    ? rawSubjectId[0]
    : rawSubjectId;
  const subjectName = Array.isArray(rawSubjectName)
    ? rawSubjectName[0]
    : rawSubjectName;
  // [BUG-813] Guard against NaN from malformed query params (e.g.
  // `?totalSessions=abc`). Without the isNaN check the UI renders
  // "NaN sessions" and downstream Number formatting breaks.
  const parsedTotalSessions = Array.isArray(rawTotalSessions)
    ? Number(rawTotalSessions[0] ?? 0)
    : Number(rawTotalSessions ?? 0);
  const totalSessions = Number.isFinite(parsedTotalSessions)
    ? parsedTotalSessions
    : 0;

  const mastery =
    masteryScore !== undefined && masteryScore !== ''
      ? Number(masteryScore)
      : null;
  const masteryPercent = mastery !== null ? Math.round(mastery * 100) : null;

  const { data: sessions, isLoading: sessionsLoading } =
    useChildSessions(profileId);
  const topicSessions = sessions?.filter((s) => s.topicId === topicId) ?? [];

  // Most recent fluency-drill outcomes for this topic. Flat-mapped across
  // sessions and sorted newest-first; capped at 5 so the strip stays scannable.
  const recentDrills = topicSessions
    .flatMap((s) => s.drills ?? [])
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="topic-detail-screen"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="me-3 py-2 pe-2"
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
          testID="back-button"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {title ?? t('parentView.topic.topic')}
          </Text>
          {subjectName || subjectId ? (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {subjectName ?? subjectId}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="mt-4">
          {/* Status card */}
          <View
            className="bg-surface rounded-card p-4"
            testID="topic-status-card"
          >
            <Text className="text-body-sm font-medium text-text-secondary mb-1">
              {t('parentView.topic.status')}
            </Text>
            <Text className="text-body font-semibold text-text-primary">
              {(() => {
                const statusKey =
                  COMPLETION_STATUS_KEYS[completionStatus ?? ''];
                if (statusKey) return t(statusKey);
                return completionStatus ?? t('parentView.topic.statusUnknown');
              })()}
            </Text>
          </View>

          {/* Understanding card */}
          {masteryPercent !== null && (
            <View
              className="bg-surface rounded-card p-4 mt-3"
              testID="topic-understanding-card"
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-1">
                  <Text className="text-body-sm font-medium text-text-secondary">
                    {t('parentView.topic.understanding')}
                  </Text>
                  <MetricInfoDot metricKey="understanding" />
                </View>
                <Text className="text-body font-semibold text-text-primary">
                  {getUnderstandingLabel(masteryPercent)}
                </Text>
              </View>
              <View className="h-2.5 bg-border rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${masteryPercent}%` }}
                />
              </View>
              <Text className="text-caption text-text-tertiary mt-1">
                {masteryPercent}%
              </Text>
            </View>
          )}

          {/* Review status card */}
          {(() => {
            const retentionInfo = getParentRetentionInfo(
              retentionStatus,
              totalSessions,
              completionStatus ?? '',
            );
            if (!retentionInfo) return null;

            const reconciliation = getReconciliationLine(
              masteryPercent ?? 0,
              retentionInfo,
            );

            return (
              <View
                className="bg-surface rounded-card p-4 mt-3"
                testID="topic-retention-card"
              >
                <View className="flex-row items-center gap-1 mb-2">
                  <Text className="text-body-sm font-medium text-text-secondary">
                    {t('parentView.topic.reviewStatus')}
                  </Text>
                  <MetricInfoDot metricKey="review-status" />
                </View>
                <View className="flex-row items-center">
                  <View
                    className="w-2.5 h-2.5 rounded-full mr-2"
                    style={{ backgroundColor: colors[retentionInfo.colorKey] }}
                  />
                  <Text className="text-body font-medium text-text-primary">
                    {retentionInfo.label}
                  </Text>
                </View>
                {reconciliation ? (
                  <Text className="text-caption text-text-secondary mt-2">
                    {reconciliation}
                  </Text>
                ) : null}
              </View>
            );
          })()}
        </View>

        {/* Recent fluency-drill scores for this topic, when any have been
            recorded. Strip-style render keeps it scannable; tap-through and
            full history are deferred until parents ask for it. */}
        {recentDrills.length > 0 ? (
          <View
            className="bg-surface rounded-card p-4 mt-3"
            testID="topic-recent-drills"
          >
            <Text className="text-body-sm font-medium text-text-secondary mb-2">
              {t('parentView.topic.recentDrills', 'Recent drills')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {recentDrills.map((drill) => (
                <View
                  key={drill.createdAt}
                  className="bg-primary-soft rounded-pill px-3 py-1"
                  testID={`drill-score-${drill.createdAt}`}
                >
                  <Text className="text-body-sm font-semibold text-primary">
                    {drill.correct}/{drill.total}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Session History */}
        <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
          {t('parentView.topic.sessionHistory')}
        </Text>
        {sessionsLoading ? (
          <View className="py-4 items-center" testID="sessions-loading">
            <ActivityIndicator />
          </View>
        ) : topicSessions.length > 0 ? (
          topicSessions.map((session) => (
            <Pressable
              key={session.sessionId}
              onPress={() =>
                router.push({
                  pathname: '/(app)/child/[profileId]/session/[sessionId]',
                  params: {
                    profileId: profileId ?? '',
                    sessionId: session.sessionId,
                  },
                } as Href)
              }
              className="bg-surface rounded-card p-4 mt-2"
              accessibilityLabel={t('parentView.topic.viewSessionFrom', {
                date: formatSessionDate(session.startedAt),
              })}
              accessibilityRole="button"
              testID={`session-card-${session.sessionId}`}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-body font-medium text-text-primary">
                  {formatSessionDate(session.startedAt)}
                </Text>
                <Text className="text-caption text-text-secondary">
                  {session.sessionType}
                </Text>
              </View>
              <Text className="text-caption text-text-secondary">
                {formatTimeOnApp(
                  session.wallClockSeconds ?? session.durationSeconds,
                  t,
                )}
              </Text>
            </Pressable>
          ))
        ) : (
          <View className="py-4 items-center" testID="no-topic-sessions">
            <Text className="text-body text-text-secondary">
              {t('parentView.topic.noSessionsYet')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
