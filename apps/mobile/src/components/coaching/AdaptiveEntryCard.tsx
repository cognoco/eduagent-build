import { type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BaseCoachingCard } from './BaseCoachingCard';

interface Action {
  label: string;
  onPress: () => void;
}

interface AdaptiveEntryCardProps {
  headline: string;
  subtext?: string;
  actions: Action[];
  isLoading?: boolean;
}

export function AdaptiveEntryCard({
  headline,
  subtext,
  actions,
  isLoading,
}: AdaptiveEntryCardProps): ReactNode {
  const [primary, ...secondary] = actions;

  if (!primary) {
    return null;
  }

  const secondaryButtons =
    secondary.length > 0 ? (
      <View className="flex-row gap-3 mt-1">
        {secondary.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            className="flex-1 items-center py-2"
            style={{ minHeight: 44 }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text className="text-text-secondary text-body">
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    ) : undefined;

  return (
    <BaseCoachingCard
      headline={headline}
      subtext={subtext}
      primaryLabel={primary.label}
      onPrimary={primary.onPress}
      footer={secondaryButtons}
      isLoading={isLoading}
      testID="adaptive-entry-card"
    />
  );
}
