import { useState, useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { usePrepareHomework } from '../../../hooks/use-dictation-api';
import { useThemeColors } from '../../../lib/theme';
import { useDictationData } from './_layout';

export default function TextPreviewScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { ocrText } = useLocalSearchParams<{ ocrText?: string }>();
  const [text, setText] = useState(ocrText ?? '');
  const prepareMutation = usePrepareHomework();
  const { setData } = useDictationData();

  // B1.4: 20s timeout hint for the prepare mutation — mirrors dictation/index.tsx pattern
  const [prepareTimedOut, setPrepareTimedOut] = useState(false);
  const prepareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (prepareMutation.isPending) {
      setPrepareTimedOut(false);
      prepareTimeoutRef.current = setTimeout(
        () => setPrepareTimedOut(true),
        20_000
      );
    } else {
      if (prepareTimeoutRef.current) clearTimeout(prepareTimeoutRef.current);
      setPrepareTimedOut(false);
    }
    return () => {
      if (prepareTimeoutRef.current) clearTimeout(prepareTimeoutRef.current);
    };
  }, [prepareMutation.isPending]);

  const handleStartDictation = async () => {
    if (!text.trim()) {
      platformAlert('No text', 'Please enter or photograph some text first.');
      return;
    }

    try {
      const result = await prepareMutation.mutateAsync({ text: text.trim() });
      setData({
        sentences: result.sentences,
        language: result.language,
        mode: 'homework',
      });
      // [F-030] Yield to React render cycle so context state commits before
      // playback screen mounts (same race as dictation/index.tsx).
      setTimeout(() => router.push('/(app)/dictation/playback' as never), 0);
    } catch (err) {
      console.warn('[dictation] homework preparation failed:', err);
      platformAlert(
        'Something went wrong',
        'Could not prepare your dictation. Try again?',
        [
          { text: 'Try again', onPress: () => void handleStartDictation() },
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
      testID="dictation-text-preview-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/dictation')}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="text-preview-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          Check the text
        </Text>
      </View>

      <Text className="text-body-sm text-text-secondary mb-3">
        {ocrText
          ? 'Edit any mistakes from the photo, then start your dictation.'
          : 'Review your text, then start your dictation.'}
      </Text>

      <TextInput
        className="bg-surface-elevated border border-border rounded-xl p-4 text-text-primary text-body min-h-[200px]"
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        placeholderTextColor={colors.textSecondary}
        placeholder="Type or paste your text here..."
        testID="text-preview-input"
        accessibilityLabel="Dictation text"
      />

      <Pressable
        onPress={() => void handleStartDictation()}
        disabled={prepareMutation.isPending || !text.trim()}
        className={`mt-6 rounded-xl py-4 items-center ${
          prepareMutation.isPending || !text.trim()
            ? 'bg-primary/50'
            : 'bg-primary'
        }`}
        testID="text-preview-start"
        accessibilityRole="button"
        accessibilityLabel={
          prepareMutation.isPending ? 'Preparing dictation' : 'Start dictation'
        }
      >
        <Text className="text-text-inverse font-semibold text-body">
          {prepareMutation.isPending ? 'Preparing...' : 'Start dictation'}
        </Text>
      </Pressable>

      {prepareMutation.isPending && (
        <>
          {prepareTimedOut && (
            <Text
              className="text-body-sm text-danger text-center mt-3"
              testID="text-preview-timeout-hint"
            >
              This is taking longer than usual — you can cancel and try again.
            </Text>
          )}
          <Pressable
            onPress={() => {
              prepareMutation.reset();
              goBackOrReplace(router, '/(app)/dictation');
            }}
            className="mt-3 py-2 px-4 min-h-[44px] items-center justify-center self-center"
            accessibilityRole="button"
            accessibilityLabel="Cancel preparing dictation"
            testID="text-preview-cancel"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              Cancel
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
