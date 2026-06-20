import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CoLearningPromptPayload } from '@eduagent/schemas';

interface CoLearningPromptPolicyNoticeProps {
  payload: CoLearningPromptPayload;
  onFill: (text: string) => void;
  onDismiss: () => void;
}

export function CoLearningPromptPolicyNotice({
  payload,
  onFill,
  onDismiss,
}: CoLearningPromptPolicyNoticeProps): React.ReactElement {
  const { t } = useTranslation();
  return (
    <View
      testID="visibility-co-learning-notice"
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {t('visibility.coLearning.title')}
      </Text>
      <Text className="mt-2 text-body text-text-secondary">
        {payload.suggestedText}
      </Text>
      <View className="mt-4 flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('visibility.coLearning.fill')}
          className="min-h-[48px] flex-1 items-center justify-center rounded-button bg-primary px-4 py-3"
          onPress={() => onFill(payload.suggestedText)}
          testID="visibility-co-learning-fill"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('visibility.coLearning.fill')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('visibility.coLearning.dismiss')}
          className="min-h-[48px] flex-1 items-center justify-center rounded-button bg-surface px-4 py-3"
          onPress={onDismiss}
          testID="visibility-co-learning-dismiss"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('visibility.coLearning.dismiss')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
