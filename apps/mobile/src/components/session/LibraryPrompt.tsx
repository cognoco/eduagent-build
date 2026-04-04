import { Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export function LibraryPrompt(): React.JSX.Element {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/(learner)/library' as never)}
      testID="session-library-link"
      accessibilityRole="link"
      accessibilityLabel="Go to the Library"
      className="mt-2 items-center py-2"
    >
      <Text className="text-caption text-text-secondary">
        Want to see your previous lessons?{' '}
        <Text className="underline font-medium">Go to the Library</Text>
      </Text>
    </Pressable>
  );
}
