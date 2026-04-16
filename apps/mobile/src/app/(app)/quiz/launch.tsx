import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGenerateRound } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

const LOADING_MESSAGES = [
  'Shuffling questions...',
  'Picking a theme...',
  'Almost ready...',
];

export default function QuizLaunchScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activityType, setRound } = useQuizFlow();
  const generateRound = useGenerateRound();
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!activityType) {
      router.replace('/(app)/quiz' as never);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    generateRound.mutate(
      { activityType },
      {
        onSuccess: (round) => {
          setRound(round);
          router.replace('/(app)/quiz/play' as never);
        },
      }
    );
  }, [activityType, generateRound, router, setRound]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingMessageIndex(
        (current) => (current + 1) % LOADING_MESSAGES.length
      );
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  if (!activityType) {
    return <View className="flex-1 bg-background" />;
  }

  if (generateRound.isError) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="quiz-launch-error"
      >
        <Ionicons name="alert-circle-outline" size={52} color={colors.danger} />
        <Text className="mt-4 text-center text-h3 font-bold text-text-primary">
          Couldn&apos;t create a round
        </Text>
        <Text className="mt-2 text-center text-body text-text-secondary">
          Try again, or head back and pick a different activity.
        </Text>

        <View className="mt-8 w-full gap-3">
          <Pressable
            onPress={() => generateRound.mutate({ activityType })}
            className="min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
            testID="quiz-launch-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Retry
            </Text>
          </Pressable>

          <Pressable
            onPress={() => goBackOrReplace(router, '/(app)/quiz')}
            className="min-h-[48px] items-center justify-center rounded-button bg-surface-elevated px-6 py-3"
            testID="quiz-launch-back"
          >
            <Text className="text-body font-semibold text-text-primary">
              Go Back
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="quiz-launch-loading"
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text className="mt-4 text-body text-text-secondary">
        {LOADING_MESSAGES[loadingMessageIndex]}
      </Text>
    </View>
  );
}
