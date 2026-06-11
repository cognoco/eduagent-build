import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLinkedChildren } from '../../lib/profile';

type Props = {
  sourceChildProfileId?: string | null;
  createdAt?: string | Date | null;
};

function wasRecentlyAdded(
  createdAt: string | Date | null | undefined,
): boolean {
  if (!createdAt) return false;
  const timestamp =
    createdAt instanceof Date
      ? createdAt.getTime()
      : new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp < 24 * 60 * 60 * 1000;
}

export function TopicProvenance({
  sourceChildProfileId,
  createdAt,
}: Props): React.ReactElement | null {
  const { t } = useTranslation();
  const children = useLinkedChildren();
  const childName = useMemo(
    () =>
      sourceChildProfileId
        ? children.find((child) => child.id === sourceChildProfileId)
            ?.displayName
        : undefined,
    [children, sourceChildProfileId],
  );
  const recent = wasRecentlyAdded(createdAt);

  if (!childName && !recent) return null;

  return (
    <View className="mt-2 flex-row flex-wrap gap-2" testID="topic-provenance">
      {childName ? (
        <View
          className="rounded-full bg-primary/10 px-2 py-1"
          testID="topic-provenance-child"
        >
          <Text className="text-caption font-semibold text-primary">
            {t('library.provenanceFrom', { name: childName })}
          </Text>
        </View>
      ) : null}
      {recent ? (
        <View
          className="rounded-full bg-success/10 px-2 py-1"
          testID="topic-provenance-recent"
        >
          <Text className="text-caption font-semibold text-success">
            {t('library.recentlyAdded')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
