import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export type WeeklyDeltaMetric =
  | 'topicsMastered'
  | 'vocabularyTotal'
  | 'topicsExplored';

export function WeeklyDeltaChip({
  metric,
  value,
}: {
  metric: WeeklyDeltaMetric;
  value: number | null;
}): React.ReactElement | null {
  const { t } = useTranslation();

  if (value === null) {
    return null;
  }

  return (
    <View
      className="bg-surface border border-border rounded-full px-3 py-1.5"
      testID={`progress-weekly-delta-${metric}`}
    >
      <Text className="text-caption font-semibold text-text-primary">
        {t(`progress.weeklyDelta.${metric}`, {
          count: Math.max(0, value),
        })}
      </Text>
    </View>
  );
}
