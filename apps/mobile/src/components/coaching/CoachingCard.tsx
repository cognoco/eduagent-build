import { View, Text, Pressable } from 'react-native';

interface CoachingCardProps {
  headline: string;
  subtext?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}

export function CoachingCard({
  headline,
  subtext,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: CoachingCardProps) {
  return (
    <View className="bg-coaching-card rounded-card p-5 mt-4">
      <Text className="text-display font-bold text-text-primary leading-tight">
        {headline}
      </Text>
      {subtext && (
        <Text className="text-body text-text-secondary mt-2">{subtext}</Text>
      )}
      <Pressable
        onPress={onPrimary}
        className="bg-primary rounded-button py-3.5 mt-5 items-center"
        style={{ minHeight: 48 }}
      >
        <Text className="text-text-inverse text-body font-semibold">
          {primaryLabel}
        </Text>
      </Pressable>
      {secondaryLabel && onSecondary && (
        <Pressable
          onPress={onSecondary}
          className="mt-3 items-center py-2"
          style={{ minHeight: 44 }}
        >
          <Text className="text-text-secondary text-body">
            {secondaryLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
