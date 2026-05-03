import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useDictationData } from './_layout';
import { useRecordDictationResult } from '../../../hooks/use-dictation-api';

export default function DictationReviewScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data } = useDictationData();
  const recordResult = useRecordDictationResult();

  const reviewResult = data?.reviewResult;
  const sentences = data?.sentences ?? [];
  const mode = data?.mode ?? 'homework';
  const mistakes = reviewResult?.mistakes ?? [];

  const [currentMistakeIndex, setCurrentMistakeIndex] = useState(0);
  const [typedSentence, setTypedSentence] = useState('');
  const [completedCount, setCompletedCount] = useState(0);

  const isPerfect = mistakes.length === 0;
  const currentMistake = mistakes[currentMistakeIndex];
  const allCorrected = completedCount >= mistakes.length;

  const handleSubmitCorrection = () => {
    // Accept whatever they type — the value is in the rewriting act
    setCompletedCount((prev) => prev + 1);
    setTypedSentence('');
    if (currentMistakeIndex < mistakes.length - 1) {
      setCurrentMistakeIndex((prev) => prev + 1);
    }
  };

  const handleDone = async () => {
    const localDate = new Date().toISOString().slice(0, 10);
    const mistakeCount = mistakes.length;

    try {
      await recordResult.mutateAsync({
        localDate,
        sentenceCount: sentences.length,
        mistakeCount,
        mode,
        reviewed: true,
      });
      // [CRIT-2] Navigate only after successful save — guarded per CLAUDE.md
      router.replace('/(app)/practice' as never);
    } catch (err) {
      // [CRIT-2] Show user-visible feedback on failure — bare catch {} is forbidden.
      // Pattern matches complete.tsx [ASSUMP-F11].
      console.warn('[dictation] review result recording failed:', err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : t('dictation.review.couldNotSaveResult');
      platformAlert(t('dictation.review.couldNotSaveTitle'), message, [
        {
          text: t('common.retry'),
          onPress: () => void handleDone(),
        },
        {
          text: t('dictation.review.continueWithoutSaving'),
          style: 'cancel',
          onPress: () => router.replace('/(app)/practice' as never),
        },
      ]);
    }
  };

  const handleBack = () => {
    goBackOrReplace(router, '/(app)/practice' as never);
  };

  // No review data guard — should not happen in normal flow
  if (!reviewResult) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        testID="review-no-data"
      >
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text
          className="text-body text-text-primary mt-4 text-center"
          accessibilityRole="text"
        >
          {t('dictation.review.noDataFound')}
        </Text>
        <Pressable
          onPress={handleBack}
          className="mt-6 bg-primary rounded-xl py-3 px-8"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="review-go-back"
        >
          <Text className="text-text-inverse font-semibold text-body">
            {t('common.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Celebration screen: perfect score or all mistakes corrected
  if (isPerfect || allCorrected) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        testID="review-celebration"
      >
        <Ionicons
          name={isPerfect ? 'trophy' : 'checkmark-done-circle'}
          size={64}
          color={colors.primary}
        />
        <Text
          className="text-h2 font-bold text-text-primary mt-4 text-center"
          accessibilityRole="header"
        >
          {isPerfect
            ? t('dictation.review.perfect')
            : t('dictation.review.fixedAll', { count: mistakes.length })}
        </Text>
        <Text className="text-body text-text-secondary mt-2 text-center">
          {t('dictation.review.scoreLabel', {
            correct: reviewResult.correctCount,
            total: reviewResult.totalSentences,
          })}
        </Text>

        <Pressable
          onPress={() => void handleDone()}
          disabled={recordResult.isPending}
          className="bg-primary rounded-xl py-4 px-8 mt-8"
          testID="review-done"
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
        >
          {recordResult.isPending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text className="text-text-inverse font-semibold text-body">
              {t('common.done')}
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  // Remediation screen: mistakes one by one
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="review-remediation-screen"
    >
      {/* Header */}
      <Text
        className="text-h3 font-bold text-text-primary mb-1"
        accessibilityRole="header"
      >
        {t('dictation.review.mistakesFound', { count: mistakes.length })}
      </Text>
      <Text className="text-body-sm text-text-secondary mb-6">
        {t('dictation.review.correctionProgress', {
          current: completedCount + 1,
          total: mistakes.length,
        })}
      </Text>

      {/* Current mistake card */}
      {currentMistake && (
        <View
          className="bg-surface-elevated rounded-xl p-4 mb-4"
          testID="review-mistake-card"
        >
          {/* Original sentence */}
          <Text className="text-body-sm text-text-secondary mb-1">
            {t('dictation.review.original')}
          </Text>
          <Text className="text-body text-text-primary mb-3">
            {currentMistake.original}
          </Text>

          {/* What was written */}
          {currentMistake.written ? (
            <>
              <Text className="text-body-sm text-text-secondary mb-1">
                {t('dictation.review.youWrote')}
              </Text>
              <Text className="text-body mb-3" style={{ color: colors.danger }}>
                {currentMistake.written}
              </Text>
            </>
          ) : null}

          {/* Error label */}
          <Text className="text-body-sm text-text-secondary mb-1">
            {t('dictation.review.error')}
          </Text>
          <Text className="text-body-sm mb-3" style={{ color: colors.danger }}>
            {currentMistake.error}
          </Text>

          {/* Correction */}
          <Text className="text-body-sm text-text-secondary mb-1">
            {t('dictation.review.correctVersion')}
          </Text>
          <Text
            className="text-body font-semibold mb-3"
            style={{ color: colors.success }}
          >
            {currentMistake.correction}
          </Text>

          {/* Explanation */}
          <Text className="text-body-sm text-text-secondary">
            {currentMistake.explanation}
          </Text>
        </View>
      )}

      {/* Retype input */}
      <Text className="text-body-sm text-text-secondary mb-2">
        {t('dictation.review.nowTypeCorrect')}
      </Text>
      <TextInput
        className="bg-surface-elevated border border-border rounded-xl p-4 text-text-primary text-body min-h-[80px]"
        value={typedSentence}
        onChangeText={setTypedSentence}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        autoCapitalize="none"
        placeholder={t('dictation.review.typeCorrectedPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={t('dictation.review.typeCorrectedLabel')}
        testID="review-correction-input"
      />

      {/* Submit button */}
      <Pressable
        onPress={handleSubmitCorrection}
        disabled={!typedSentence.trim()}
        className={`mt-4 rounded-xl py-4 items-center ${
          !typedSentence.trim() ? 'opacity-50 bg-primary' : 'bg-primary'
        }`}
        testID="review-submit-correction"
        accessibilityRole="button"
        accessibilityLabel={
          currentMistakeIndex < mistakes.length - 1
            ? t('common.next')
            : t('dictation.review.finish')
        }
      >
        <Text className="text-text-inverse font-semibold text-body">
          {currentMistakeIndex < mistakes.length - 1
            ? t('common.next')
            : t('dictation.review.finish')}
        </Text>
      </Pressable>

      {/* Back link */}
      <Pressable
        onPress={handleBack}
        className="mt-4 py-3 items-center"
        testID="review-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.goBack')}
      >
        <Text className="text-body-sm text-text-muted">
          {t('common.goBack')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
