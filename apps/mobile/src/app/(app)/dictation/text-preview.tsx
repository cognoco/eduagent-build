import { useState, useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { usePrepareHomework } from '../../../hooks/use-dictation-api';
import { useThemeColors } from '../../../lib/theme';
import { useDictationData } from './_layout';

export default function TextPreviewScreen(): React.ReactElement {
  const { t } = useTranslation();
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
  // [BUG-692] Set when back arrow, Cancel button, or 20s timeout fires while
  // the mutation is in flight. Prevents a late response from pushing to playback.
  const prepareCancelledRef = useRef(false);
  useEffect(() => {
    if (prepareMutation.isPending) {
      setPrepareTimedOut(false);
      prepareTimeoutRef.current = setTimeout(() => {
        // [BUG-692] Timeout counts as cancellation.
        prepareCancelledRef.current = true;
        setPrepareTimedOut(true);
      }, 20_000);
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
      platformAlert(
        t('dictation.textPreview.noTextTitle'),
        t('dictation.textPreview.noTextMessage'),
      );
      return;
    }

    // [BUG-692] Reset cancelled flag at the start of each new attempt.
    prepareCancelledRef.current = false;

    try {
      const result = await prepareMutation.mutateAsync({ text: text.trim() });

      // [BUG-692] If back arrow, Cancel button, or the 20s timeout fired
      // while the mutation was in flight, skip navigation to playback.
      if (prepareCancelledRef.current) return;

      setData({
        sentences: result.sentences,
        language: result.language,
        mode: 'homework',
      });
      // [F-030] Yield to React render cycle so context state commits before
      // playback screen mounts (same race as dictation/index.tsx).
      setTimeout(() => router.push('/(app)/dictation/playback' as never), 0);
    } catch (err) {
      // [BUG-692] Don't show an alert if the user already navigated away.
      if (prepareCancelledRef.current) return;
      console.warn('[dictation] homework preparation failed:', err);
      platformAlert(
        t('dictation.textPreview.prepareErrorTitle'),
        t('dictation.textPreview.prepareErrorMessage'),
        [
          {
            text: t('dictation.textPreview.tryAgain'),
            onPress: () => void handleStartDictation(),
          },
          { text: t('common.goBack'), style: 'cancel' },
        ],
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
          onPress={() => {
            prepareCancelledRef.current = true; // [BUG-692]
            goBackOrReplace(router, '/(app)/dictation');
          }}
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="text-preview-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          {t('dictation.textPreview.title')}
        </Text>
      </View>

      <Text className="text-body-sm text-text-secondary mb-3">
        {ocrText
          ? t('dictation.textPreview.subtitleFromPhoto')
          : t('dictation.textPreview.subtitleManual')}
      </Text>

      <TextInput
        className="bg-surface-elevated border border-border rounded-xl p-4 text-text-primary text-body min-h-[200px]"
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        placeholderTextColor={colors.textSecondary}
        placeholder={t('dictation.textPreview.inputPlaceholder')}
        testID="text-preview-input"
        accessibilityLabel={t('dictation.textPreview.inputLabel')}
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
          prepareMutation.isPending
            ? t('dictation.textPreview.preparingDictation')
            : t('dictation.textPreview.startDictation')
        }
      >
        <Text className="text-text-inverse font-semibold text-body">
          {prepareMutation.isPending
            ? t('dictation.textPreview.preparing')
            : t('dictation.textPreview.startDictation')}
        </Text>
      </Pressable>

      {prepareMutation.isPending && (
        <>
          {prepareTimedOut && (
            <Text
              className="text-body-sm text-danger text-center mt-3"
              testID="text-preview-timeout-hint"
            >
              {t('dictation.textPreview.takingLonger')}
            </Text>
          )}
          <Pressable
            onPress={() => {
              prepareCancelledRef.current = true; // [BUG-692]
              prepareMutation.reset();
              goBackOrReplace(router, '/(app)/dictation');
            }}
            className="mt-3 py-2 px-4 min-h-[44px] items-center justify-center self-center"
            accessibilityRole="button"
            accessibilityLabel={t('dictation.textPreview.cancelPreparing')}
            testID="text-preview-cancel"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
