import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../lib/theme';

// RF-09: Dictation result is NOT auto-recorded on mount.
// "I'm done" is an explicit user action that records the result.
// "Check my writing" (future) will record with reviewed=true + mistakeCount.

export default function DictationCompleteScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  // Gated until image pass-through feature is complete (Task 11 blocked)
  const imagePassThroughAvailable = false;

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
      testID="dictation-complete-screen"
    >
      <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
      <Text
        className="text-h2 font-bold text-text-primary mt-4 text-center"
        accessibilityRole="header"
      >
        Well done!
      </Text>
      <Text className="text-body text-text-secondary mt-2 text-center">
        Want to check your work?
      </Text>

      <View className="w-full gap-3 mt-8">
        {imagePassThroughAvailable && (
          <Pressable
            onPress={() => {
              // TODO: navigate to camera then review when image pass-through is live
              // router.push('/(app)/dictation/review' as never);
            }}
            className="bg-primary rounded-xl py-4 items-center"
            testID="complete-check-writing"
            accessibilityRole="button"
            accessibilityLabel="Check my writing"
          >
            <View className="flex-row items-center">
              <Ionicons name="camera" size={20} color={colors.textInverse} />
              <Text className="text-text-inverse font-semibold text-body ml-2">
                Check my writing
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.replace('/(app)/practice' as never)}
          className={`rounded-xl py-4 items-center ${
            imagePassThroughAvailable ? 'bg-surface-elevated' : 'bg-primary'
          }`}
          testID="complete-done"
          accessibilityRole="button"
          accessibilityLabel="I'm done"
        >
          <Text
            className={`font-semibold text-body ${
              imagePassThroughAvailable
                ? 'text-text-primary'
                : 'text-text-inverse'
            }`}
          >
            I'm done
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(app)/dictation' as never)}
          className="py-3 items-center"
          testID="complete-try-again"
          accessibilityRole="button"
          accessibilityLabel="Try another dictation"
        >
          <Text className="text-body-sm text-text-muted">
            Try another dictation
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
