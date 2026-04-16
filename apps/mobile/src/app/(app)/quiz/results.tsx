import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandCelebration } from '../../../components/common/BrandCelebration';
import { useFetchRound } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

export default function QuizResultsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    activityType,
    completionResult,
    prefetchedRoundId,
    round,
    setCompletionResult,
    setPrefetchedRoundId,
    setRound,
    clear,
  } = useQuizFlow();
  const prefetchedRound = useFetchRound(prefetchedRoundId);

  const score = completionResult?.score ?? 0;
  const total = completionResult?.total ?? 0;
  const xpEarned = completionResult?.xpEarned ?? 0;
  const celebrationTier = completionResult?.celebrationTier ?? 'nice';

  const tierConfig = {
    perfect: {
      icon: 'trophy' as const,
      title: 'Perfect round!',
      color: colors.warning,
    },
    great: {
      icon: 'star' as const,
      title: 'Great round!',
      color: colors.primary,
    },
    nice: {
      icon: 'thumbs-up' as const,
      title: 'Nice effort!',
      color: colors.textSecondary,
    },
  };

  const config = tierConfig[celebrationTier];

  function handlePlayAgain() {
    setCompletionResult(null);

    if (prefetchedRound.data) {
      setRound(prefetchedRound.data);
      setPrefetchedRoundId(null);
      router.replace('/(app)/quiz/play' as never);
      return;
    }

    if (!activityType) {
      goBackOrReplace(router, '/(app)/practice');
      return;
    }

    router.replace('/(app)/quiz/launch' as never);
  }

  function handleDone() {
    clear();
    goBackOrReplace(router, '/(app)/practice');
  }

  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="quiz-results-screen"
    >
      {(celebrationTier === 'perfect' || celebrationTier === 'great') && (
        <View className="mb-6">
          <BrandCelebration size={96} />
        </View>
      )}

      <Ionicons name={config.icon} size={56} color={config.color} />
      <Text className="mt-4 text-center text-h1 font-bold text-text-primary">
        {config.title}
      </Text>
      <Text className="mt-6 text-display font-bold text-text-primary">
        {score}/{total}
      </Text>

      {round?.theme ? (
        <Text className="mt-2 text-center text-body text-text-secondary">
          {round.theme}
        </Text>
      ) : null}

      {xpEarned > 0 ? (
        <View className="mt-4 rounded-full bg-primary-soft px-4 py-2">
          <Text className="text-body-sm font-semibold text-primary">
            +{xpEarned} XP
          </Text>
        </View>
      ) : null}

      <View className="mt-10 w-full gap-3">
        <Pressable
          onPress={handlePlayAgain}
          className="min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
          testID="quiz-results-play-again"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Play Again
          </Text>
        </Pressable>

        <Pressable
          onPress={handleDone}
          className="min-h-[48px] items-center justify-center rounded-button bg-surface-elevated px-6 py-3"
          testID="quiz-results-done"
        >
          <Text className="text-body font-semibold text-text-primary">
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
