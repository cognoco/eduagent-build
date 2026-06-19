import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SubjectHubAggregate } from './_view-models/subject-hub-state';

interface SubjectHubProgressSummaryProps {
  aggregate: SubjectHubAggregate;
}

export function SubjectHubProgressSummary({
  aggregate,
}: SubjectHubProgressSummaryProps): React.ReactElement {
  const { t } = useTranslation();
  const hasPracticePoints =
    aggregate.recentPracticePoints !== null &&
    aggregate.recentPracticePoints !== undefined;

  return (
    <View testID="subject-hub-progress-summary" className="mt-3 gap-2">
      <Text className="text-body-sm font-semibold text-text-primary">
        {t('subjectHub.progress.threeState', {
          mastered: aggregate.mastered,
          learning: aggregate.learning,
          total: aggregate.total,
        })}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Text className="rounded-full bg-surface px-3 py-1 text-caption text-text-secondary">
          {aggregate.reviewsDue > 0
            ? t('subjectHub.progress.reviewsDue', {
                count: aggregate.reviewsDue,
              })
            : t('subjectHub.progress.noReviewsDue')}
        </Text>
        <Text className="rounded-full bg-surface px-3 py-1 text-caption text-text-secondary">
          {aggregate.weeklyMasteredDelta > 0
            ? t('subjectHub.progress.weeklyDelta', {
                count: aggregate.weeklyMasteredDelta,
              })
            : t('subjectHub.progress.noWeeklyDelta')}
        </Text>
        <Text className="rounded-full bg-surface px-3 py-1 text-caption text-text-secondary">
          {hasPracticePoints
            ? t('subjectHub.progress.practicePoints', {
                points: aggregate.recentPracticePoints,
              })
            : t('subjectHub.progress.noPracticePoints')}
        </Text>
      </View>
    </View>
  );
}
