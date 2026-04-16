import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../../components/home/IntentCard';
import { goBackOrReplace } from '../../../lib/navigation';
import { useGenerateDictation } from '../../../hooks/use-dictation-api';
import { useThemeColors } from '../../../lib/theme';
import { useDictationData } from './_layout';

export default function DictationChoiceScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const generateMutation = useGenerateDictation();
  const { setData } = useDictationData();

  const handleSurpriseMe = async () => {
    try {
      const result = await generateMutation.mutateAsync();
      setData({
        sentences: result.sentences,
        language: result.language,
        title: result.title,
        topic: result.topic,
        mode: 'surprise',
      });
      router.push('/(app)/dictation/playback' as never);
    } catch {
      Alert.alert(
        "Couldn't create a dictation right now",
        'Would you like to try again?',
        [
          { text: 'Try again', onPress: () => void handleSurpriseMe() },
          { text: 'Go back', style: 'cancel' },
        ]
      );
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="dictation-choice-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/practice')}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="dictation-choice-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          Dictation
        </Text>
      </View>

      {generateMutation.isPending ? (
        <View
          className="items-center justify-center py-16"
          testID="dictation-loading"
        >
          <Text className="text-body text-text-primary mb-2">
            Picking a topic...
          </Text>
          <Text className="text-body-sm text-text-secondary">
            This takes a few seconds
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          <IntentCard
            title="I have a text"
            subtitle="Take a photo of your dictation"
            onPress={() =>
              router.push('/(app)/dictation/text-preview' as never)
            }
            testID="dictation-homework"
          />
          <IntentCard
            title="Surprise me"
            subtitle="Practice with a new dictation"
            onPress={() => void handleSurpriseMe()}
            testID="dictation-surprise"
          />
        </View>
      )}
    </ScrollView>
  );
}
