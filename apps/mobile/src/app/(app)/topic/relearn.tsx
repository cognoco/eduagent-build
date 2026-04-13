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
// Persona-conditional copy — documented exception, same pattern as (app)/home.tsx
import { useTheme } from '../../../lib/theme';
import { formatApiError } from '../../../lib/format-api-error';

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

const TEACHING_METHODS_LEARNER = [
  {
    id: 'visual_diagrams' as const,
    label: 'Show Me Pictures',
    description: 'Learn with pictures, charts, and drawings',
  },
  {
    id: 'step_by_step' as const,
    label: 'Walk Me Through It',
    description: 'Break it down into small, easy steps',
  },
  {
    id: 'real_world_examples' as const,
    label: 'Show Me How It Works',
    description: 'Learn with fun, everyday examples',
  },
  {
    id: 'practice_problems' as const,
    label: 'Let Me Try It',
    description: 'Learn by solving problems with help',
  },
];

/** Copy strings that vary by persona. */
const COPY_DEFAULT = {
  phase1Intro:
    "Every topic needs its own approach. Let's find what clicks for you!",
  differentMethodLabel: 'Different Method',
  differentMethodDesc:
    'Choose a new teaching style that might work better for you',
  sameMethodLabel: 'Same Method',
  sameMethodDesc: 'Review the topic again using your current learning approach',
  phase2Intro: 'Pick a teaching style that works best for you:',
} as const;

const COPY_LEARNER = {
  phase1Intro: "Let's find what works best for you!",
  differentMethodLabel: 'Try Something New',
  differentMethodDesc: "Let's try learning this a different way!",
  sameMethodLabel: 'Same Method',
  sameMethodDesc: "Let's go over it again the same way",
  phase2Intro: 'How would you like to learn this time?',
} as const;

export default function RelearnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { topicId, subjectId } = useLocalSearchParams<{
    topicId: string;
    subjectId: string;
  }>();

  const startRelearn = useStartRelearn();
  const { persona } = useTheme();

  const isLearner = persona === 'learner';
  const methods = isLearner ? TEACHING_METHODS_LEARNER : TEACHING_METHODS;
  const copy = isLearner ? COPY_LEARNER : COPY_DEFAULT;

  const [phase, setPhase] = useState<'choice' | 'method'>('choice');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSameMethod = useCallback(() => {
    if (!topicId) return;
    setError(null);
    setIsSubmitting(true);
    startRelearn.mutate(
      { topicId, method: 'same' },
      {
        onSuccess: (result) => {
          router.push({
            pathname: '/(app)/session',
            params: {
              sessionId: result.sessionId,
              subjectId,
              topicId,
              mode: 'relearn',
            },
          });
        },
        onError: (err: unknown) => {
          setError(formatApiError(err));
        },
        onSettled: () => setIsSubmitting(false),
      }
    );
  }, [topicId, subjectId, startRelearn, router]);

  const handleSelectMethod = useCallback(
    (preferredMethod: string) => {
      if (!topicId) return;
      setError(null);
      setIsSubmitting(true);
      startRelearn.mutate(
        { topicId, method: 'different', preferredMethod },
        {
          onSuccess: (result) => {
            router.push({
              pathname: '/(app)/session',
              params: {
                sessionId: result.sessionId,
                subjectId,
                topicId,
                mode: 'relearn',
              },
            });
          },
          onError: (err: unknown) => {
            setError(formatApiError(err));
          },
          onSettled: () => setIsSubmitting(false),
        }
      );
    },
    [topicId, subjectId, startRelearn, router]
  );

  if (!topicId || !subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          Unable to open relearn
        </Text>
        <Text className="text-text-secondary text-body text-center mb-6">
          Missing required parameters. Please go back and try again.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="relearn-missing-params-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Go back
          </Text>
        </Pressable>
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
          {error && (
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-4"
              testID="relearn-error"
            >
              <Text className="text-body-sm text-danger">{error}</Text>
            </View>
          )}
          <Text className="text-body text-text-secondary mb-6">
            {copy.phase1Intro}
          </Text>

          <Pressable
            onPress={() => setPhase('method')}
            className="bg-primary rounded-card p-4 mb-3"
            testID="relearn-different-method"
            accessibilityLabel="Try a different teaching method (recommended)"
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-text-inverse mb-1">
              {copy.differentMethodLabel}
            </Text>
            <Text className="text-body-sm text-text-inverse opacity-80">
              {copy.differentMethodDesc}
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
              {copy.sameMethodLabel}
            </Text>
            <Text className="text-body-sm text-text-secondary">
              {copy.sameMethodDesc}
            </Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {error && (
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-4"
              testID="relearn-error"
            >
              <Text className="text-body-sm text-danger">{error}</Text>
            </View>
          )}
          <Text className="text-body text-text-secondary mb-6">
            {copy.phase2Intro}
          </Text>

          {methods.map((method) => (
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
