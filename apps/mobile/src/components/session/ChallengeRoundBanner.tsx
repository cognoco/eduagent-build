import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function ChallengeRoundBanner({
  questionIndex,
  totalQuestions,
}: {
  questionIndex: number;
  totalQuestions: number;
}) {
  const { t } = useTranslation();
  return (
    <View
      className="px-4 py-2 bg-accent-soft border-b border-accent"
      testID="challenge-round-banner"
    >
      <Text className="text-on-accent-soft text-sm">
        {t('session.challenge.banner.question', {
          index: questionIndex + 1,
          total: totalQuestions,
        })}
      </Text>
    </View>
  );
}
