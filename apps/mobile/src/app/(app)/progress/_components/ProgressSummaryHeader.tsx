import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProgressSummary } from '@eduagent/schemas';
import { formatRelativeDate } from '../../../../lib/format-relative-date';

export function ProgressSummaryHeader({
  summary,
}: {
  summary: ProgressSummary;
}): React.ReactElement {
  const { t } = useTranslation();
  if (summary.summary == null) {
    return (
      <View
        testID="progress-summary-fallback"
        className="bg-coaching-card rounded-card p-5 mt-4"
      >
        <Text className="text-body text-text-secondary">
          {t('progress.guardian.summaryFallback')}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="progress-summary-header"
      className="bg-coaching-card rounded-card p-5 mt-4"
    >
      <Text className="text-body text-text-primary">{summary.summary}</Text>
      {summary.activityState === 'no_recent_activity' ? (
        <View testID="progress-summary-no-recent">
          <Text className="text-body-sm text-text-secondary mt-2">
            {summary.basedOnLastSessionAt
              ? t('progress.guardian.noRecentSessions', {
                  date: formatRelativeDate(summary.basedOnLastSessionAt),
                })
              : t('progress.guardian.noRecentSessionsFallback')}
          </Text>
        </View>
      ) : null}
      {summary.activityState === 'stale' ? (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('progress.guardian.staleSummary')}
        </Text>
      ) : null}
    </View>
  );
}
