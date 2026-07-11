import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../lib/theme';
import type { LanguageLearningActivityEvent } from '../../lib/sse';

export interface MeaningOutputCardProps {
  activity: LanguageLearningActivityEvent;
  onDismiss?: () => void;
}

export function MeaningOutputCard({
  activity,
  onDismiss,
}: MeaningOutputCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const meaningOutput = activity.meaningOutput;

  if (!meaningOutput) {
    return null;
  }

  const targetWords =
    meaningOutput.targetWords.length > 0
      ? meaningOutput.targetWords.join(', ')
      : null;

  return (
    <View
      className="mx-4 mb-3 rounded-card bg-surface-elevated px-4 py-3"
      testID="meaning-output-card"
      accessibilityRole="summary"
    >
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-caption font-semibold uppercase text-primary">
            {t('session.meaningOutput.title')}
          </Text>
          <Text className="mt-0.5 text-caption text-text-secondary">
            {meaningOutput.communicativeGoal}
          </Text>
        </View>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('session.meaningOutput.dismissLabel')}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface"
            testID="meaning-output-dismiss"
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <Text
        className="text-body text-text-primary"
        testID="meaning-output-prompt"
      >
        {meaningOutput.prompt}
      </Text>

      {targetWords ? (
        <Text className="mt-2 text-caption text-text-secondary">
          {t('session.meaningOutput.targetWords', { words: targetWords })}
        </Text>
      ) : null}
    </View>
  );
}
