import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

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
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="bg-surface-elevated rounded-card border-l-4 border-primary flex-row items-center px-5 py-5 active:opacity-80 min-h-[112px]"
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
    >
      <View className="flex-1 justify-center">
        <Text className="text-h2 font-bold text-text-primary">{title}</Text>
        {subtitle ? (
          <Text className="text-body text-text-secondary mt-2">{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.primary} />
    </Pressable>
  );
}
