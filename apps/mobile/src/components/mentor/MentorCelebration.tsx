import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface MentorCelebrationProps {
  eventId: string;
  messageKey: string;
  seenEventIds?: ReadonlySet<string>;
  onMarkSeen?: (eventId: string) => void;
}

export function MentorCelebration({
  eventId,
  messageKey,
  seenEventIds = new Set<string>(),
  onMarkSeen,
}: MentorCelebrationProps) {
  const { t } = useTranslation();
  const alreadySeen = seenEventIds.has(eventId);

  useEffect(() => {
    if (!alreadySeen) {
      onMarkSeen?.(eventId);
    }
  }, [alreadySeen, eventId, onMarkSeen]);

  if (alreadySeen) {
    return (
      <View testID="mentor-celebration-static" className="rounded-xl p-3">
        <Text className="text-text-primary">{t(messageKey)}</Text>
      </View>
    );
  }

  return (
    <View
      testID="mentor-celebration"
      className="rounded-xl border border-accent bg-surface p-3"
    >
      <Text className="font-semibold text-text-primary">{t(messageKey)}</Text>
    </View>
  );
}
