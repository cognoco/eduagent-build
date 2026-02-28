import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStartRelearn } from '../../../hooks/use-retention';

const TEACHING_METHODS = [
  {
    id: 'visual_diagrams' as const,
    label: 'Visual Diagrams',
    description: 'Learn through charts, diagrams, and visual representations',
  },
  {
    id: 'step_by_step' as const,
    label: 'Step-by-Step',
    description: 'Break concepts down into clear, sequential steps',
  },
  {
    id: 'real_world_examples' as const,
    label: 'Real-World Examples',
    description: 'Connect concepts to practical, everyday situations',
  },
  {
    id: 'practice_problems' as const,
    label: 'Practice Problems',
    description: 'Learn by working through guided exercises',
  },
];

export default function RelearnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { topicId, subjectId } = useLocalSearchParams<{
    topicId: string;
    subjectId: string;
  }>();

  const startRelearn = useStartRelearn();

  const [phase, setPhase] = useState<'choice' | 'method'>('choice');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSameMethod = useCallback(() => {
    if (!topicId) return;
    setIsSubmitting(true);
    startRelearn.mutate(
      { topicId, method: 'same' },
      {
        onSuccess: (result) => {
          router.push({
            pathname: '/(learner)/session',
            params: {
              sessionId: result.sessionId,
              subjectId,
              topicId,
              mode: 'relearn',
            },
          });
        },
        onSettled: () => setIsSubmitting(false),
      }
    );
  }, [topicId, subjectId, startRelearn, router]);

  const handleSelectMethod = useCallback(
    (preferredMethod: string) => {
      if (!topicId) return;
      setIsSubmitting(true);
      startRelearn.mutate(
        { topicId, method: 'different', preferredMethod },
        {
          onSuccess: (result) => {
            router.push({
              pathname: '/(learner)/session',
              params: {
                sessionId: result.sessionId,
                subjectId,
                topicId,
                mode: 'relearn',
              },
            });
          },
          onSettled: () => setIsSubmitting(false),
        }
      );
    },
    [topicId, subjectId, startRelearn, router]
  );

  if (!topicId || !subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text-secondary">Missing topic information</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          testID="relearn-back"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-h3">&larr;</Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          Relearn Topic
        </Text>
      </View>

      {isSubmitting ? (
        <View
          className="flex-1 items-center justify-center"
          testID="relearn-loading"
        >
          <ActivityIndicator size="large" />
          <Text className="text-text-secondary mt-2">
            Starting relearn session...
          </Text>
        </View>
      ) : phase === 'choice' ? (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Text className="text-body text-text-secondary mb-6">
            Every topic needs its own approach. Let's find what clicks for you!
          </Text>

          <Pressable
            onPress={() => setPhase('method')}
            className="bg-primary rounded-card p-4 mb-3"
            testID="relearn-different-method"
            accessibilityLabel="Try a different teaching method (recommended)"
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-text-inverse mb-1">
              Different Method
            </Text>
            <Text className="text-body-sm text-text-inverse opacity-80">
              Choose a new teaching style that might work better for you
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSameMethod}
            className="bg-surface rounded-card p-4 mb-3"
            testID="relearn-same-method"
            accessibilityLabel="Continue with same method"
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-text-primary mb-1">
              Same Method
            </Text>
            <Text className="text-body-sm text-text-secondary">
              Review the topic again using your current learning approach
            </Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Text className="text-body text-text-secondary mb-6">
            Pick a teaching style that works best for you:
          </Text>

          {TEACHING_METHODS.map((method) => (
            <Pressable
              key={method.id}
              onPress={() => handleSelectMethod(method.id)}
              className="bg-surface rounded-card p-4 mb-3"
              testID={`relearn-method-${method.id}`}
              accessibilityLabel={`Learn with ${method.label}`}
              accessibilityRole="button"
            >
              <Text className="text-body font-semibold text-text-primary mb-1">
                {method.label}
              </Text>
              <Text className="text-body-sm text-text-secondary">
                {method.description}
              </Text>
            </Pressable>
          ))}

          <Pressable
            onPress={() => setPhase('choice')}
            className="mt-2 py-3 items-center"
            testID="relearn-back-to-choice"
            accessibilityLabel="Go back to method choice"
            accessibilityRole="button"
          >
            <Text className="text-body-sm font-medium text-text-secondary">
              Back
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
