import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface OnTrackBadgeProps {
  reviewsDue?: number;
}

export function OnTrackBadge({ reviewsDue }: OnTrackBadgeProps) {
  const { t } = useTranslation();

  return (
    <View
      testID="mentor-on-track-badge"
      className="flex-row items-center gap-2 rounded-full border border-border bg-surface px-3 py-2"
    >
      <Text className="text-sm font-semibold text-text-primary">
        {t('mentorHome.onTrack.label')}
      </Text>
      {reviewsDue != null && reviewsDue > 0 ? (
        <>
          <Text className="text-sm text-primary">{String(reviewsDue)}</Text>
          <Text className="text-xs text-text-secondary">
            {t('mentorHome.onTrack.reviewsDue', { count: reviewsDue })}
          </Text>
        </>
      ) : (
        <Text className="text-xs text-text-secondary">
          {t('mentorHome.onTrack.dueCleared')}
        </Text>
      )}
    </View>
  );
}
