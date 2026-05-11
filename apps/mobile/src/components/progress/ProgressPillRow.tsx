import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Profile } from '@eduagent/schemas';

interface ProgressPillRowProps {
  childrenProfiles: ReadonlyArray<Profile>;
  selectedProfileId: string | null;
  ownProfileId: string | undefined;
  onSelect: (profileId: string) => void;
}

export function ProgressPillRow({
  childrenProfiles,
  selectedProfileId,
  ownProfileId,
  onSelect,
}: ProgressPillRowProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (!ownProfileId || childrenProfiles.length === 0) return null;

  const pills = [
    ...childrenProfiles.map((profile) => ({
      id: profile.id,
      label: profile.displayName,
    })),
    { id: ownProfileId, label: t('progress.ownProfilePill') },
  ];

  return (
    <View className="mb-4" testID="progress-parent-pill-row">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 24 }}
      >
        {pills.map((pill) => {
          const selected = pill.id === selectedProfileId;
          return (
            <Pressable
              key={pill.id}
              onPress={() => onSelect(pill.id)}
              className={
                'min-h-[40px] rounded-full px-4 items-center justify-center border ' +
                (selected
                  ? 'bg-primary border-primary'
                  : 'bg-surface border-border')
              }
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`progress-pill-${pill.id}`}
            >
              <Text
                className={
                  'text-body-sm font-semibold ' +
                  (selected ? 'text-text-inverse' : 'text-text-primary')
                }
                numberOfLines={1}
              >
                {pill.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
