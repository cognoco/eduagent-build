import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTextToSpeech } from '../../hooks/use-text-to-speech';
import { useThemeColors } from '../../lib/theme';
import type { LanguageLearningActivityEvent } from '../../lib/sse';

export interface GradedInputCardProps {
  activity: LanguageLearningActivityEvent;
  textToSpeechLanguage?: string;
  onDismiss?: () => void;
}

export function GradedInputCard({
  activity,
  textToSpeechLanguage,
  onDismiss,
}: GradedInputCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const gradedInput = activity.gradedInput;
  const { isSpeaking, speak, stop } = useTextToSpeech({
    language: textToSpeechLanguage,
  });

  const handlePlayPress = useCallback(() => {
    if (!gradedInput) return;
    if (isSpeaking) {
      stop();
      return;
    }
    speak(gradedInput.text);
  }, [gradedInput, isSpeaking, speak, stop]);

  if (!gradedInput) {
    return null;
  }

  const primaryQuestion = gradedInput.comprehensionQuestions[0];
  const targetWords =
    gradedInput.targetWords.length > 0
      ? gradedInput.targetWords.join(', ')
      : null;

  return (
    <View
      className="mx-4 mb-3 rounded-card bg-surface-elevated px-4 py-3"
      testID="graded-input-card"
      accessibilityRole="summary"
    >
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-caption font-semibold uppercase text-primary">
            {t('session.gradedInput.title')}
          </Text>
          <Text className="mt-0.5 text-caption text-text-secondary">
            {t('session.gradedInput.subtitle', {
              level: gradedInput.cefrLevel,
            })}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {gradedInput.audioEnabled ? (
            <Pressable
              onPress={handlePlayPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                isSpeaking
                  ? t('session.gradedInput.stopAudioLabel')
                  : t('session.gradedInput.playAudioLabel')
              }
              className="h-9 w-9 items-center justify-center rounded-full bg-surface"
              testID="graded-input-play"
            >
              <Ionicons
                name={isSpeaking ? 'stop' : 'volume-medium'}
                size={18}
                color={colors.accent}
              />
            </Pressable>
          ) : null}
          {onDismiss ? (
            <Pressable
              onPress={onDismiss}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('session.gradedInput.dismissLabel')}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface"
              testID="graded-input-dismiss"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text
        className="text-body text-text-primary"
        testID="graded-input-passage"
      >
        {gradedInput.text}
      </Text>

      {targetWords ? (
        <Text className="mt-2 text-caption text-text-secondary">
          {t('session.gradedInput.targetWords', { words: targetWords })}
        </Text>
      ) : null}

      {primaryQuestion ? (
        <View className="mt-3 border-t border-border pt-3">
          <Text className="text-caption font-semibold text-text-secondary">
            {t('session.gradedInput.questionLabel')}
          </Text>
          <Text
            className="mt-1 text-body-sm text-text-primary"
            testID="graded-input-question"
          >
            {primaryQuestion.prompt}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
