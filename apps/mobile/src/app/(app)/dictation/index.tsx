import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../../components/home/IntentCard';
import { goBackOrReplace } from '../../../lib/navigation';
import { useGenerateDictation } from '../../../hooks/use-dictation-api';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import { useDictationData } from './_layout';
import { formatApiError } from '../../../lib/format-api-error';
import { useState, useEffect, useRef } from 'react';

export default function DictationChoiceScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const generateMutation = useGenerateDictation();
  const { setData } = useDictationData();
  const [lastError, setLastError] = useState<string | null>(null);
  const [generateTimedOut, setGenerateTimedOut] = useState(false);
  const generateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start/clear 20s timeout whenever the pending state changes
  useEffect(() => {
    if (generateMutation.isPending) {
      setGenerateTimedOut(false);
      generateTimeoutRef.current = setTimeout(() => {
        setGenerateTimedOut(true);
      }, 20_000);
    } else {
      if (generateTimeoutRef.current) clearTimeout(generateTimeoutRef.current);
      setGenerateTimedOut(false);
    }
    return () => {
      if (generateTimeoutRef.current) clearTimeout(generateTimeoutRef.current);
    };
  }, [generateMutation.isPending]);

  const handleSurpriseMe = async () => {
    setLastError(null);
    setGenerateTimedOut(false);
    try {
      const result = await generateMutation.mutateAsync();
      setData({
        sentences: result.sentences,
        language: result.language,
        title: result.title,
        topic: result.topic,
        mode: 'surprise',
      });
      // [F-030] Yield to React render cycle so context state commits before
      // playback screen mounts. Without this, useState setter hasn't flushed
      // and playback sees data=null on first attempt.
      setTimeout(() => router.push('/(app)/dictation/playback' as never), 0);
    } catch (err: unknown) {
      const message = formatApiError(err);
      setLastError(message);
      platformAlert("Couldn't create a dictation right now", message, [
        { text: 'Try again', onPress: () => void handleSurpriseMe() },
        { text: 'Go back', style: 'cancel' },
      ]);
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
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
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

      {lastError && !generateMutation.isPending ? (
        <View
          className="mb-4 rounded-card bg-surface p-4"
          testID="dictation-error"
        >
          <Text className="text-body-sm text-text-secondary mb-2">
            {lastError}
          </Text>
          <Pressable
            onPress={() => void handleSurpriseMe()}
            accessibilityRole="button"
            accessibilityLabel="Retry dictation"
            testID="dictation-error-retry"
          >
            <Text className="font-semibold text-primary text-body-sm">
              Tap to retry
            </Text>
          </Pressable>
        </View>
      ) : null}

      {generateMutation.isPending ? (
        <View
          className="items-center justify-center py-16"
          testID="dictation-loading"
        >
          {generateTimedOut ? (
            <>
              <Text
                className="text-body text-danger mb-2 text-center"
                testID="dictation-timeout-error"
              >
                That took too long — try again
              </Text>
              <Pressable
                onPress={() => {
                  generateMutation.reset();
                  void handleSurpriseMe();
                }}
                className="mt-2 bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Retry generating a dictation"
                testID="dictation-timeout-retry"
              >
                <Text className="text-text-inverse font-semibold text-body">
                  Retry
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="text-body text-text-primary mb-2">
                Picking a topic...
              </Text>
              <Text className="text-body-sm text-text-secondary">
                This takes a few seconds
              </Text>
            </>
          )}
          <Pressable
            onPress={() => generateMutation.reset()}
            className="mt-4 py-2 px-4 min-h-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Cancel generating a dictation"
            testID="dictation-loading-cancel"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-4">
          <IntentCard
            title="I have a text"
            subtitle="Type or paste your own text"
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
