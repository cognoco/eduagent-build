import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../../../components/progress';
import { useChildSubjectTopics } from '../../../../../hooks/use-dashboard';
import { useChildInventory } from '../../../../../hooks/use-progress';

const COMPLETION_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  verified: 'Verified',
  stable: 'Stable',
};

function TopicSkeleton(): React.ReactNode {
  return (
    <View className="bg-surface rounded-card p-4 mt-3">
      <View className="bg-border rounded h-5 w-2/3 mb-2" />
      <View className="bg-border rounded h-3 w-1/3 mb-2" />
      <View className="bg-border rounded-full h-2 w-full" />
    </View>
  );
}

export default function SubjectTopicsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    profileId,
    subjectId,
    subjectName: routeSubjectName,
  } = useLocalSearchParams<{
    profileId: string;
    subjectId: string;
    subjectName?: string;
  }>();
  const { data: topics, isLoading } = useChildSubjectTopics(
    profileId,
    subjectId
  );
  const { data: inventory } = useChildInventory(profileId);
  const subjectName =
    routeSubjectName ??
    inventory?.subjects.find((subject) => subject.subjectId === subjectId)
      ?.subjectName ??
    'Subject';

  if (!profileId || !subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-text-secondary text-body text-center">
          Unable to load subject details.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
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
        <Text className="text-h2 font-bold text-text-primary">
          {subjectName}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="subject-topics-scroll"
      >
        {isLoading ? (
          <>
            <TopicSkeleton />
            <TopicSkeleton />
            <TopicSkeleton />
          </>
        ) : topics && topics.length > 0 ? (
          topics.map((topic) => (
            <Pressable
              key={topic.topicId}
              onPress={() =>
                router.push({
                  pathname: '/(app)/child/[profileId]/topic/[topicId]',
                  params: {
                    profileId: profileId!,
                    topicId: topic.topicId,
                    title: topic.title,
                    completionStatus: topic.completionStatus,
                    masteryScore: String(topic.masteryScore ?? ''),
                    retentionStatus: topic.retentionStatus ?? '',
                    subjectId: subjectId!,
                  },
                } as never)
              }
              className="bg-surface rounded-card p-4 mt-3"
              accessibilityLabel={`View ${topic.title} details`}
              accessibilityRole="button"
              testID={`topic-card-${topic.topicId}`}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-body font-medium text-text-primary flex-1 me-2">
                  {topic.title}
                </Text>
                {topic.retentionStatus && (
                  <RetentionSignal
                    status={topic.retentionStatus as RetentionStatus}
                  />
                )}
              </View>
              <Text className="text-caption text-text-secondary mb-2">
                {COMPLETION_LABELS[topic.completionStatus] ??
                  topic.completionStatus}
              </Text>
              {topic.masteryScore !== null &&
                topic.masteryScore !== undefined && (
                  <View className="h-2 bg-border rounded-full overflow-hidden">
                    <View
                      className="h-full bg-primary rounded-full"
                      style={{
                        width: `${Math.round(topic.masteryScore * 100)}%`,
                      }}
                    />
                  </View>
                )}
            </Pressable>
          ))
        ) : (
          <View className="py-8 items-center">
            <Text className="text-body text-text-secondary">No topics yet</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
