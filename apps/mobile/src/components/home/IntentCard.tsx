import { Pressable, Text } from 'react-native';

interface IntentCardProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  testID?: string;
}

export function IntentCard({
  title,
  subtitle,
  onPress,
  testID,
}: IntentCardProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      className="bg-surface-elevated rounded-card px-5 py-5 active:opacity-80 min-h-[112px] justify-center"
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
    >
      <Text className="text-h2 font-bold text-text-primary">{title}</Text>
      {subtitle ? (
        <Text className="text-body text-text-secondary mt-2">{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}
