import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface IntentCardProps {
  title: string;
  subtitle?: string;
  badge?: number;
  variant?: 'default' | 'highlight';
  onPress: () => void;
  testID?: string;
}

export function IntentCard({
  title,
  subtitle,
  badge,
  variant = 'default',
  onPress,
  testID,
}: IntentCardProps): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-card border-l-4 border-primary flex-row items-center px-5 py-5 active:opacity-80 min-h-[112px] ${
        variant === 'highlight' ? 'bg-primary-soft' : 'bg-surface-elevated'
      }`}
      accessibilityRole="button"
      accessibilityLabel={badge != null ? `${title}, ${badge} items` : title}
      accessibilityHint="Opens this activity"
      testID={testID}
    >
      <View className="flex-1 justify-center">
        <View className="flex-row items-center">
          <Text className="text-h2 font-bold text-text-primary flex-shrink">
            {title}
          </Text>
          {badge != null ? (
            <View
              className="ml-3 rounded-full bg-primary-soft px-2.5 py-1"
              testID={`${testID ?? 'intent-card'}-badge`}
            >
              <Text className="text-caption font-semibold text-primary">
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text className="text-body text-text-secondary mt-2">{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.primary} />
    </Pressable>
  );
}
