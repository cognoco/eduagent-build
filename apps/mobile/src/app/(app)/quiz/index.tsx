import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../../components/home/IntentCard';
import { useQuizStats } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

export default function QuizIndexScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: stats } = useQuizStats();
  const {
    setActivityType,
    setRound,
    setPrefetchedRoundId,
    setCompletionResult,
  } = useQuizFlow();

  const capitalsStats = stats?.find((stat) => stat.activityType === 'capitals');
  const capitalsSubtitle =
    capitalsStats &&
    capitalsStats.bestScore != null &&
    capitalsStats.bestTotal != null
      ? `Best: ${capitalsStats.bestScore}/${capitalsStats.bestTotal} · Played: ${capitalsStats.roundsPlayed}`
      : capitalsStats
      ? `Played: ${capitalsStats.roundsPlayed}`
      : 'Test yourself on world capitals';

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="quiz-index-screen"
    >
      <View className="mb-6 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/practice')}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="quiz-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="flex-1 text-h2 font-bold text-text-primary">Quiz</Text>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Capitals"
          subtitle={capitalsSubtitle}
          onPress={() => {
            setActivityType('capitals');
            setRound(null);
            setPrefetchedRoundId(null);
            setCompletionResult(null);
            router.push('/(app)/quiz/launch' as never);
          }}
          testID="quiz-capitals"
        />
      </View>
    </ScrollView>
  );
}
