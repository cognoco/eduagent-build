import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '../../lib/theme';

interface MentorMemoryCueProps {
  title: string;
  subtitle: string;
  onPress: () => void;
}

export function MentorMemoryCue({
  title,
  subtitle,
  onPress,
}: MentorMemoryCueProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      className="bg-surface rounded-card p-4 mb-4 min-h-[64px] flex-row items-center"
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      testID="session-summary-mentor-memory-cue"
    >
      <View className="flex-1 pr-3">
        <Text className="text-body font-semibold text-text-primary">
          {title}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}
