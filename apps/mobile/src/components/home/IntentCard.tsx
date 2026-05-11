import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface IntentCardProps {
  title: string;
  subtitle?: string;
  badge?: number;
  variant?: 'default' | 'highlight' | 'subtle' | 'accent';
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
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
  const isHighlight = variant === 'highlight';
  const isSubtle = variant === 'subtle';
  const isAccent = variant === 'accent';
  const accentColor = isAccent
    ? colors.secondary
    : isSubtle
      ? colors.textSecondary
      : colors.primary;
  const webPointerStyle: StyleProp<ViewStyle> =
    Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : undefined;

  function handleDismiss(event?: GestureResponderEvent) {
    event?.stopPropagation?.();
    onDismiss?.();
  }

  const containerClassName = `rounded-card border-l-4 flex-row items-center px-5 py-5 min-h-[112px] ${
    isHighlight
      ? 'bg-primary-soft'
      : isSubtle
        ? 'bg-surface border-border'
        : 'bg-surface-elevated'
  }${onPress ? ' active:opacity-80' : ''}`;

  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? {
        onPress,
        accessibilityRole: 'button' as const,
        accessibilityLabel: badge != null ? `${title}, ${badge} items` : title,
        accessibilityHint: 'Opens this activity',
      }
    : {
        accessibilityLabel: badge != null ? `${title}, ${badge} items` : title,
      };

  return (
    <Wrapper
      {...wrapperProps}
      className={containerClassName}
      style={StyleSheet.compose(webPointerStyle, {
        borderLeftColor: accentColor,
      })}
      testID={testID}
    >
      <View className="flex-1 flex-row items-center">
        {icon ? (
          <View
            testID={`${testID ?? 'intent-card'}-icon`}
            style={{ marginRight: 14 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name={icon} size={28} color={accentColor} />
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
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </View>
          </Pressable>
          {onPress ? (
            <View
              testID={testID ? `${testID}-chevron` : 'intent-card-chevron'}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons name="chevron-forward" size={22} color={accentColor} />
            </View>
          ) : null}
        </View>
      ) : onPress ? (
        <View
          testID={testID ? `${testID}-chevron` : 'intent-card-chevron'}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="chevron-forward" size={22} color={accentColor} />
        </View>
      ) : null}
    </Wrapper>
  );
}
