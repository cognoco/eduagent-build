import { Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export function LearningBookPrompt(): React.JSX.Element {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/(learner)/book' as never)}
      testID="session-learning-book-link"
      accessibilityRole="link"
      accessibilityLabel="Go to the Learning Book"
      className="mt-2 items-center py-2"
    >
      <Text className="text-caption text-text-secondary">
        Want to see your previous lessons?{' '}
        <Text className="underline font-medium">Go to the Learning Book</Text>
      </Text>
    </Pressable>
  );
}
