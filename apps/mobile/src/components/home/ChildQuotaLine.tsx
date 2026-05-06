import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useUsage } from '../../hooks/use-subscription';

export function ChildQuotaLine(): React.ReactElement | null {
  const { t } = useTranslation();
  const { data } = useUsage();

  if (!data) return null;

  const dailyRemaining = data.dailyRemainingQuestions;
  const monthlyRemaining =
    data.monthlyLimit == null ? null : data.remainingQuestions;

  if (dailyRemaining == null && monthlyRemaining == null) {
    return (
      <Text
        testID="child-quota-line"
        className="text-body-sm text-text-secondary"
      >
        {t('home.learner.quota.lineUnlimited')}
      </Text>
    );
  }

  if (monthlyRemaining == null) {
    return (
      <Text
        testID="child-quota-line"
        className="text-body-sm text-text-secondary"
      >
        {t('home.learner.quota.lineDailyOnly', {
          questionsLeftToday: dailyRemaining,
        })}
      </Text>
    );
  }

  if (dailyRemaining == null) {
    return (
      <Text
        testID="child-quota-line"
        className="text-body-sm text-text-secondary"
      >
        {t('home.learner.quota.lineMonthlyOnly', {
          questionsLeftMonth: monthlyRemaining,
        })}
      </Text>
    );
  }

  return (
    <Text
      testID="child-quota-line"
      className="text-body-sm text-text-secondary"
    >
      {t('home.learner.quota.line', {
        questionsLeftToday: dailyRemaining,
        questionsLeftMonth: monthlyRemaining,
      })}
    </Text>
  );
}
