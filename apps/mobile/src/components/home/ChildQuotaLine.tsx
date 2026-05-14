import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

interface ChildQuotaLineProps {
  totalTopicsCompleted: number | null;
}

export function ChildQuotaLine({
  totalTopicsCompleted,
}: ChildQuotaLineProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (totalTopicsCompleted === null) return null;

  const total = totalTopicsCompleted;
  if (total < 1) return null;

  const key =
    total === 1
      ? 'home.learner.momentum.topicLearned'
      : 'home.learner.momentum.topicsLearned';

  return (
    <Text
      testID="home-momentum-line"
      className="text-body-sm text-text-secondary"
    >
      {t(key, { n: total })}
    </Text>
  );
}
