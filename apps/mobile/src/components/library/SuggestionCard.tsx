import { Pressable, Text } from 'react-native';

interface SuggestionCardProps {
  title: string;
  emoji?: string | null;
  description?: string | null;
  onPress: () => void;
  testID?: string;
}

export function SuggestionCard({
  title,
  emoji,
  description,
  onPress,
  testID,
}: SuggestionCardProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      className="flex-1 min-w-[140px] max-w-[48%] rounded-card border border-border bg-surface-elevated p-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}: ${description}` : title}
    >
      {emoji ? <Text className="text-2xl mb-2">{emoji}</Text> : null}
      <Text
        className="text-body-sm font-semibold text-text-primary"
        numberOfLines={2}
      >
        {title}
      </Text>
      {description ? (
        <Text
          className="text-caption text-text-secondary mt-1"
          numberOfLines={2}
        >
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}
