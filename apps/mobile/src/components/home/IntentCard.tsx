import {
  Platform,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface IntentCardProps {
  title: string;
  subtitle?: string;
  badge?: number;
  variant?: 'default' | 'highlight';
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  testID?: string;
}

export function IntentCard({
  title,
  subtitle,
  badge,
  variant = 'default',
  icon,
  onPress,
  onDismiss,
  dismissLabel = 'Dismiss',
  testID,
}: IntentCardProps): React.ReactElement {
  const colors = useThemeColors();

  function handleDismiss(event?: GestureResponderEvent) {
    event?.stopPropagation?.();
    onDismiss?.();
  }

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-card border-l-4 border-primary flex-row items-center px-5 py-5 active:opacity-80 min-h-[112px] ${
        variant === 'highlight' ? 'bg-primary-soft' : 'bg-surface-elevated'
      }`}
      style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
      accessibilityRole="button"
      accessibilityLabel={badge != null ? `${title}, ${badge} items` : title}
      accessibilityHint="Opens this activity"
      testID={testID}
    >
      <View className="flex-1 flex-row items-center">
        {icon ? (
          <View
            testID={`${testID ?? 'intent-card'}-icon`}
            style={{ marginRight: 14 }}
          >
            <Ionicons name={icon} size={28} color={colors.primary} />
          </View>
        ) : null}
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
            <Text className="text-body text-text-secondary mt-2">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {onDismiss ? (
        <View className="ml-3 self-stretch items-end justify-between">
          <Pressable
            onPress={handleDismiss}
            className="min-h-[32px] min-w-[32px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            testID={testID ? `${testID}-dismiss` : undefined}
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </Pressable>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={22} color={colors.primary} />
      )}
    </Pressable>
  );
}
