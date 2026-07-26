import React from 'react';
import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import type { RecapListItem } from '@eduagent/schemas';

import { buildSessionDetailHref } from '../../lib/session-detail-navigation';

export function RecapRow({
  recap,
  returnTo,
}: {
  recap: RecapListItem;
  returnTo: string;
}): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const meta = [recap.subjectName, recap.topicTitle]
    .filter(Boolean)
    .join(' / ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('journal.recaps.openLabel', {
        title: recap.displayTitle,
      })}
      onPress={() =>
        router.push(
          buildSessionDetailHref({
            sessionId: recap.sessionId,
            subjectId: recap.subjectId,
            topicId: recap.topicId,
            returnTo,
          }),
        )
      }
      testID={`journal-recap-row-${recap.recapId}`}
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-body font-semibold text-text-primary">
        {recap.displayTitle}
      </Text>
      {meta ? (
        <Text className="mt-1 text-body-sm text-text-secondary">{meta}</Text>
      ) : null}
      {(recap.highlight ?? recap.displaySummary) ? (
        <Text
          className="mt-2 text-body-sm text-text-secondary"
          numberOfLines={2}
        >
          {recap.highlight ?? recap.displaySummary}
        </Text>
      ) : null}
    </Pressable>
  );
}
