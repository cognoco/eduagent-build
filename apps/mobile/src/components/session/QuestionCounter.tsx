import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

interface QuestionCounterProps {
  count: number;
}

export function QuestionCounter({ count }: QuestionCounterProps) {
  const { t } = useTranslation();
  if (count < 1) return null;

  return (
    <View
      className="mt-2 items-center py-2"
      testID="question-counter"
      accessibilityLabel={t('session.a11yQuestionCount', { number: count })}
    >
      <Text className="text-caption text-text-secondary font-medium">
        {t('session.questionCounter.question', { count })}
      </Text>
    </View>
  );
}
