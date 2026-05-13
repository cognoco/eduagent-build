import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { IntentCard } from '../../../components/home/IntentCard';
import { goBackOrReplace } from '../../../lib/navigation';
import { useGenerateDictation } from '../../../hooks/use-dictation-api';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import { useDictationData } from './_layout';
import { formatApiError } from '../../../lib/format-api-error';
import { useState, useEffect, useRef } from 'react';

export default function DictationChoiceScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const generateMutation = useGenerateDictation();
  const { setData } = useDictationData();
  const [lastError, setLastError] = useState<string | null>(null);
  const [generateTimedOut, setGenerateTimedOut] = useState(false);
  const generateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // [BUG-692] Set when back arrow, Cancel button, or 20s timeout fires while
  // the mutation is in flight. Prevents late-arriving response from pushing to
  // the playback screen after the user has already navigated away.
  const generateCancelledRef = useRef(false);

  // Start/clear 20s timeout whenever the pending state changes
  useEffect(() => {
    if (generateMutation.isPending) {
      setGenerateTimedOut(false);
      generateTimeoutRef.current = setTimeout(() => {
        // [BUG-692] Timeout counts as cancellation — block any late response
        // from navigating to playback.
        generateCancelledRef.current = true;
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
    // [BUG-692] Reset the cancelled flag at the start of each new attempt.
    generateCancelledRef.current = false;
    setLastError(null);
    setGenerateTimedOut(false);
    try {
      const result = await generateMutation.mutateAsync();

      // [BUG-692] If back arrow, Cancel button, or the 20s timeout fired
      // while the mutation was in flight, skip navigation to playback.
      if (generateCancelledRef.current) return;

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
      setTimeout(() => router.push('/(app)/dictation/playback' as Href), 0);
    } catch (err: unknown) {
      // [BUG-692] Don't show an alert if the user already navigated away.
      if (generateCancelledRef.current) return;
      const message = formatApiError(err);
      setLastError(message);
      platformAlert(t('dictation.index.errorTitle'), message, [
        {
          text: t('dictation.index.tryAgain'),
          onPress: () => void handleSurpriseMe(),
        },
        { text: t('common.goBack'), style: 'cancel' },
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
          onPress={() => {
            generateCancelledRef.current = true; // [BUG-692]
            goBackOrReplace(router, '/(app)/practice');
          }}
          className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="dictation-choice-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          {t('dictation.index.title')}
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
            accessibilityLabel={t('dictation.index.retryDictation')}
            testID="dictation-error-retry"
          >
            <Text className="font-semibold text-primary text-body-sm">
              {t('dictation.index.tapToRetry')}
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
                {t('dictation.index.tookTooLong')}
              </Text>
              <Pressable
                onPress={() => {
                  generateMutation.reset();
                  void handleSurpriseMe();
                }}
                className="mt-2 bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('dictation.index.retryGenerating')}
                testID="dictation-timeout-retry"
              >
                <Text className="text-text-inverse font-semibold text-body">
                  {t('common.retry')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="text-body text-text-primary mb-2">
                {t('dictation.index.loadingTitle')}
              </Text>
              <Text className="text-body-sm text-text-secondary text-center px-6">
                {t('dictation.index.loadingMessage')}
              </Text>
            </>
          )}
          <Pressable
            onPress={() => {
              generateCancelledRef.current = true; // [BUG-692]
              generateMutation.reset();
            }}
            className="mt-4 py-2 px-4 min-h-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('dictation.index.cancelGenerating')}
            testID="dictation-loading-cancel"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-4">
          <IntentCard
            title={t('dictation.index.iHaveAText')}
            subtitle={t('dictation.index.iHaveATextSubtitle')}
            onPress={() => router.push('/(app)/dictation/text-preview' as Href)}
            testID="dictation-homework"
          />
          <IntentCard
            title={t('dictation.index.surpriseMe')}
            subtitle={t('dictation.index.surpriseMeSubtitle')}
            onPress={() => void handleSurpriseMe()}
            testID="dictation-surprise"
          />
        </View>
      )}
    </ScrollView>
  );
}
