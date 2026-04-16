import React from 'react';
import { Alert, ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useThemeColors } from '../../../lib/theme';
import { useDictationData } from './_layout';
import {
  useReviewDictation,
  useRecordDictationResult,
} from '../../../hooks/use-dictation-api';

// RF-09: Dictation result is NOT auto-recorded on mount.
// "I'm done" is an explicit user action that records the result.
// "Check my writing" records with reviewed=true + mistakeCount on the review screen.

export default function DictationCompleteScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data, setData } = useDictationData();
  const reviewMutation = useReviewDictation();
  const recordResult = useRecordDictationResult();

  const isReviewing = reviewMutation.isPending;

  const handleCheckWriting = async () => {
    // 1. Launch camera
    let uri: string | undefined;
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled) return;
      uri = result.assets?.[0]?.uri;
    } catch {
      Alert.alert('Camera error', 'Could not open camera. Please try again.', [
        { text: 'OK' },
      ]);
      return;
    }

    if (!uri) return;

    // 2. Convert to base64
    let imageBase64: string;
    let imageMimeType: string;
    try {
      imageBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      imageMimeType = uri.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
    } catch {
      Alert.alert(
        'Photo error',
        'Could not read the photo. Please try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    // 3. Send to LLM for review
    const sentences = data?.sentences ?? [];
    const language = data?.language ?? 'en';

    try {
      const reviewResult = await reviewMutation.mutateAsync({
        imageBase64,
        imageMimeType,
        sentences,
        language,
      });

      // 4. Store review result in context then navigate
      if (data) {
        setData({ ...data, reviewResult });
      }
      router.push('/(app)/dictation/review' as never);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Review failed', message, [
        {
          text: 'Try again',
          onPress: () => void handleCheckWriting(),
        },
        { text: 'Skip', style: 'cancel' },
      ]);
    }
  };

  const handleDone = async () => {
    const sentences = data?.sentences ?? [];
    const mode = data?.mode ?? 'homework';
    const localDate = new Date().toISOString().slice(0, 10);

    try {
      await recordResult.mutateAsync({
        localDate,
        sentenceCount: sentences.length,
        mistakeCount: null,
        mode,
        reviewed: false,
      });
    } catch (err) {
      console.warn('[dictation] streak recording failed:', err);
      Alert.alert(
        'Note',
        'Your progress was saved but the streak could not be updated. It will sync next time.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(app)/practice' as never),
          },
        ]
      );
      return;
    }

    router.replace('/(app)/practice' as never);
  };

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
      testID="dictation-complete-screen"
    >
      {isReviewing ? (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-body text-text-secondary mt-4 text-center">
            Checking your writing…
          </Text>
        </>
      ) : (
        <>
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
            <Pressable
              onPress={() => void handleCheckWriting()}
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

            <Pressable
              onPress={() => void handleDone()}
              disabled={recordResult.isPending}
              className="rounded-xl py-4 items-center bg-surface-elevated"
              testID="complete-done"
              accessibilityRole="button"
              accessibilityLabel="I'm done"
            >
              {recordResult.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="font-semibold text-body text-text-primary">
                  I'm done
                </Text>
              )}
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
        </>
      )}
    </View>
  );
}
