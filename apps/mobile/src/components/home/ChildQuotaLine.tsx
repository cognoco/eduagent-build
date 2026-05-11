import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useOverallProgress } from '../../hooks/use-progress';

export function ChildQuotaLine(): React.ReactElement | null {
  const { t } = useTranslation();
  const { data } = useOverallProgress();

  if (!data) return null;

  const total = data.totalTopicsCompleted;
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
