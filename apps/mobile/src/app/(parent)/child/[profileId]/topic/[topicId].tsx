import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../../../components/progress';
import { useChildSessions } from '../../../../../hooks/use-dashboard';

const COMPLETION_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  verified: 'Verified',
  stable: 'Stable',
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

export default function TopicDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    topicId,
    profileId,
    title,
    completionStatus,
    masteryScore,
    retentionStatus,
    subjectId,
  } = useLocalSearchParams<{
    topicId: string;
    profileId: string;
    title: string;
    completionStatus: string;
    masteryScore: string;
    retentionStatus: string;
    subjectId: string;
  }>();

  const mastery =
    masteryScore !== undefined && masteryScore !== ''
      ? Number(masteryScore)
      : null;
  const masteryPercent = mastery !== null ? Math.round(mastery * 100) : null;

  const { data: sessions, isLoading: sessionsLoading } =
    useChildSessions(profileId);
  const topicSessions = sessions?.filter((s) => s.topicId === topicId) ?? [];

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="topic-detail-screen"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="me-3 py-2 pe-2"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          testID="back-button"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {title ?? 'Topic'}
          </Text>
          {subjectId ? (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {subjectId}
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
              Status
            </Text>
            <Text className="text-body font-semibold text-text-primary">
              {COMPLETION_LABELS[completionStatus ?? ''] ??
                completionStatus ??
                'Unknown'}
            </Text>
          </View>

          {/* Mastery card */}
          {masteryPercent !== null && (
            <View
              className="bg-surface rounded-card p-4 mt-3"
              testID="topic-mastery-card"
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-body-sm font-medium text-text-secondary">
                  Mastery
                </Text>
                <Text className="text-body font-semibold text-text-primary">
                  {masteryPercent}%
                </Text>
              </View>
              <View className="h-2.5 bg-border rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${masteryPercent}%` }}
                />
              </View>
            </View>
          )}

          {/* Retention card */}
          {retentionStatus ? (
            <View
              className="bg-surface rounded-card p-4 mt-3"
              testID="topic-retention-card"
            >
              <Text className="text-body-sm font-medium text-text-secondary mb-2">
                Retention
              </Text>
              <RetentionSignal status={retentionStatus as RetentionStatus} />
            </View>
          ) : null}
        </View>

        {/* Session History */}
        <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
          Session History
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
                  pathname: '/(parent)/child/[profileId]/session/[sessionId]',
                  params: {
                    profileId: profileId!,
                    sessionId: session.sessionId,
                  },
                } as never)
              }
              className="bg-surface rounded-card p-4 mt-2"
              accessibilityLabel={`View session from ${formatSessionDate(
                session.startedAt
              )}`}
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
              <View className="flex-row items-center">
                <Text className="text-caption text-text-secondary me-4">
                  {session.exchangeCount} exchanges
                </Text>
                <Text className="text-caption text-text-secondary">
                  {formatDuration(session.durationSeconds)}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <View className="py-4 items-center" testID="no-topic-sessions">
            <Text className="text-body text-text-secondary">
              No sessions for this topic yet
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
