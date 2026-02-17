import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { RetentionSignal } from '../../components/RetentionSignal';
import { useSubjects } from '../../hooks/use-subjects';
import { useApiGet } from '../../lib/auth-api';

type RetentionStatus = 'strong' | 'fading' | 'weak';

interface Topic {
  name: string;
  subject: string;
  retention: RetentionStatus;
}

interface RetentionTopic {
  name: string;
  retentionStatus?: string;
}

export default function LearningBookScreen() {
  const insets = useSafeAreaInsets();
  const { get } = useApiGet();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();

  const { data: topics, isLoading: topicsLoading } = useQuery({
    queryKey: ['topics', subjects?.map((s) => s.id)],
    queryFn: async (): Promise<Topic[]> => {
      if (!subjects || subjects.length === 0) return [];

      const results = await Promise.all(
        subjects.map(async (subject) => {
          const data = await get<{
            topics: RetentionTopic[];
            reviewDueCount: number;
          }>(`/subjects/${subject.id}/retention`);
          return (
            data.topics?.map((t) => ({
              name: t.name,
              subject: subject.name,
              retention: (t.retentionStatus ?? 'strong') as RetentionStatus,
            })) ?? []
          );
        })
      );

      return results.flat();
    },
    enabled: !!subjects && subjects.length > 0,
  });

  const isLoading = subjectsLoading || topicsLoading;
  const allTopics = topics ?? [];
  const subjectCount = new Set(allTopics.map((t) => t.subject)).size;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">
          Learning Book
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {isLoading
            ? 'Loading...'
            : `${allTopics.length} topics across ${subjectCount} subjects`}
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator />
          </View>
        ) : allTopics.length > 0 ? (
          allTopics.map((topic) => (
            <View
              key={`${topic.subject}-${topic.name}`}
              className="bg-surface rounded-card px-4 py-3 mb-2"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-body font-medium text-text-primary">
                    {topic.name}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-1">
                    {topic.subject}
                  </Text>
                </View>
                <RetentionSignal status={topic.retention} />
              </View>
            </View>
          ))
        ) : (
          <View className="bg-surface rounded-card px-4 py-6 items-center">
            <Text className="text-body text-text-secondary">
              No topics yet — add a subject to get started
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
