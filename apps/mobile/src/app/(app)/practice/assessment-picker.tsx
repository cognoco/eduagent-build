import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAssessmentEligibleTopics } from '../../../hooks/use-assessments';
import { Button } from '../../../components/common/Button';
import { ErrorFallback } from '../../../components/common/ErrorFallback';
import { useThemeColors } from '../../../lib/theme';

function formatStudiedAt(isoDate: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 0) return 'Studied today';
  if (diffDays === 1) return 'Studied yesterday';
  return `Studied ${diffDays} days ago`;
}

export default function AssessmentPickerScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    data: topics = [],
    isLoading,
    isError,
    refetch,
  } = useAssessmentEligibleTopics();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="assessment-picker-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="assessment-picker-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            Pick a topic to check
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            You've studied these recently - pick one to prove what stuck.
          </Text>
        </View>
      </View>

      {isError ? (
        <ErrorFallback
          variant="card"
          message="Could not load topics ready for assessment."
          primaryAction={{
            label: 'Try again',
            testID: 'assessment-picker-retry',
            onPress: () => {
              void refetch();
            },
          }}
          secondaryAction={{
            label: 'Go back',
            testID: 'assessment-picker-error-back',
            onPress: () => router.back(),
          }}
        />
      ) : isLoading ? (
        <Text className="text-body text-text-secondary">Loading topics...</Text>
      ) : topics.length === 0 ? (
        <View
          testID="assessment-picker-empty"
          className="bg-surface-elevated rounded-card px-4 py-5"
        >
          <Text className="text-body font-semibold text-text-primary">
            You haven't studied any topics recently
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Start a session first, then come back to check what stuck.
          </Text>
          <View className="mt-4">
            <Button
              variant="primary"
              label="Browse topics"
              testID="assessment-picker-browse"
              onPress={() => router.push('/(app)/library' as never)}
            />
          </View>
        </View>
      ) : (
        <View className="gap-3">
          {topics.map((topic) => (
            <Pressable
              key={topic.topicId}
              testID={`assessment-topic-${topic.topicId}`}
              className="bg-surface-elevated rounded-card px-4 py-4 flex-row items-center active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel={`Start assessment for ${topic.topicTitle}`}
              onPress={() =>
                router.push({
                  pathname: '/(app)/practice/assessment',
                  params: {
                    subjectId: topic.subjectId,
                    topicId: topic.topicId,
                  },
                } as never)
              }
            >
              <View className="flex-1">
                <Text className="text-body font-semibold text-text-primary">
                  {topic.topicTitle}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {topic.subjectName} - {formatStudiedAt(topic.lastStudiedAt)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={colors.primary}
              />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
