import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../../components/progress';
import {
  useChildDetail,
  useChildSessions,
} from '../../../../hooks/use-dashboard';

function SubjectSkeleton(): React.ReactNode {
  return (
    <View className="bg-surface rounded-card p-4 mt-3">
      <View className="bg-border rounded h-5 w-1/2 mb-2" />
      <View className="bg-border rounded h-4 w-1/3" />
    </View>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '--';
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChildDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { data: child, isLoading } = useChildDetail(profileId);
  const { data: sessions, isLoading: sessionsLoading } =
    useChildSessions(profileId);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 py-2 pr-2"
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
            {child?.displayName ?? 'Loading...'}
          </Text>
          {child && (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {child.summary}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="child-detail-scroll"
      >
        {isLoading ? (
          <>
            <SubjectSkeleton />
            <SubjectSkeleton />
            <SubjectSkeleton />
          </>
        ) : child?.subjects && child.subjects.length > 0 ? (
          <>
            <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
              Subjects
            </Text>
            {child.subjects.map((subject) => (
              <Pressable
                key={subject.name}
                onPress={() =>
                  router.push({
                    pathname:
                      '/(parent)/child/[profileId]/subjects/[subjectId]',
                    params: {
                      profileId: profileId!,
                      subjectId: subject.name,
                    },
                  } as never)
                }
                className="bg-surface rounded-card p-4 mt-3 flex-row items-center justify-between"
                accessibilityLabel={`View ${subject.name} details`}
                accessibilityRole="button"
                testID={`subject-card-${subject.name}`}
              >
                <Text className="text-body font-medium text-text-primary">
                  {subject.name}
                </Text>
                <RetentionSignal
                  status={subject.retentionStatus as RetentionStatus}
                />
              </Pressable>
            ))}
          </>
        ) : (
          <View className="py-8 items-center">
            <Text className="text-body text-text-secondary">
              No subjects yet
            </Text>
          </View>
        )}

        {/* Recent Sessions */}
        <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
          Recent Sessions
        </Text>
        {sessionsLoading ? (
          <>
            <SubjectSkeleton />
            <SubjectSkeleton />
          </>
        ) : sessions && sessions.length > 0 ? (
          sessions.map((session) => (
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
              className="bg-surface rounded-card p-4 mt-3"
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
                <Text className="text-caption text-text-secondary mr-4">
                  {session.exchangeCount} exchanges
                </Text>
                <Text className="text-caption text-text-secondary">
                  {formatDuration(session.durationSeconds)}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <View className="py-4 items-center">
            <Text className="text-body text-text-secondary">
              No sessions yet
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
