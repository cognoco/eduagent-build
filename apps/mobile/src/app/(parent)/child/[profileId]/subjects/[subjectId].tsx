import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../../../components/progress';
import { useChildSubjectTopics } from '../../../../../hooks/use-dashboard';

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
  const { profileId, subjectId } = useLocalSearchParams<{
    profileId: string;
    subjectId: string;
  }>();
  const { data: topics, isLoading } = useChildSubjectTopics(
    profileId,
    subjectId
  );

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
        <Text className="text-h2 font-bold text-text-primary">
          {subjectId ?? 'Subject'}
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
            <View
              key={topic.topicId}
              className="bg-surface rounded-card p-4 mt-3"
              testID={`topic-card-${topic.topicId}`}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-body font-medium text-text-primary flex-1 mr-2">
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
            </View>
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
