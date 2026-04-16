import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../components/home/IntentCard';
import { goBackOrReplace } from '../../lib/navigation';
import { useReviewSummary } from '../../hooks/use-progress';
import { useThemeColors } from '../../lib/theme';

export default function PracticeScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: reviewSummary } = useReviewSummary();

  const reviewDueCount = reviewSummary?.totalOverdue ?? 0;
  const reviewSubtitle =
    reviewDueCount > 0
      ? `${reviewDueCount} ${
          reviewDueCount === 1 ? 'topic' : 'topics'
        } ready for review`
      : 'Keep your knowledge fresh';

  const handleBack = () => {
    goBackOrReplace(router, '/(app)/learn-new');
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="practice-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={handleBack}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="practice-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          Practice
        </Text>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Review topics"
          subtitle={reviewSubtitle}
          badge={reviewDueCount > 0 ? reviewDueCount : undefined}
          onPress={() => {
            const nextReviewTopic = reviewSummary?.nextReviewTopic ?? null;
            if (nextReviewTopic) {
              router.push({
                pathname: '/(app)/topic/relearn',
                params: {
                  topicId: nextReviewTopic.topicId,
                  subjectId: nextReviewTopic.subjectId,
                  topicName: nextReviewTopic.topicTitle,
                },
              } as never);
            } else {
              router.push('/(app)/library' as never);
            }
          }}
          testID="practice-review"
        />
        <IntentCard
          title="Recite"
          subtitle="Recite a poem or text from memory"
          onPress={() =>
            router.push({
              pathname: '/(app)/session',
              params: { mode: 'recitation' },
            } as never)
          }
          testID="practice-recitation"
        />
        <IntentCard
          title="Dictation"
          subtitle="Practice writing what you hear"
          onPress={() => router.push('/(app)/dictation' as never)}
          testID="practice-dictation"
        />
      </View>
    </ScrollView>
  );
}
