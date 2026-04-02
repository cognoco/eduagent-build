import { View, Text, Pressable } from 'react-native';

interface HomeActionCardProps {
  title: string;
  subtitle: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  badge?: string;
  onDismiss?: () => void;
  dismissDisabled?: boolean;
  compact?: boolean;
  testID?: string;
}

export function HomeActionCard({
  title,
  subtitle,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  badge,
  onDismiss,
  dismissDisabled = false,
  compact = false,
  testID,
}: HomeActionCardProps): React.ReactElement {
  return (
    <View
      className={
        compact
          ? 'bg-coaching-card rounded-card px-4 py-4'
          : 'bg-coaching-card rounded-card px-5 py-5'
      }
      testID={testID}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 me-3">
          {badge ? (
            <View className="self-start rounded-full bg-primary/10 px-2 py-1 mb-2">
              <Text className="text-caption font-semibold text-primary">
                {badge}
              </Text>
            </View>
          ) : null}
          <Text
            className={
              compact
                ? 'font-bold text-text-primary text-h3'
                : 'font-bold text-text-primary text-display'
            }
          >
            {title}
          </Text>
          <Text className="text-body text-text-secondary mt-2">{subtitle}</Text>
        </View>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            disabled={dismissDisabled}
            className="min-h-[32px] min-w-[32px] items-center justify-center rounded-full bg-surface-elevated"
            accessibilityRole="button"
            accessibilityLabel="Dismiss card"
            testID={testID ? `${testID}-dismiss` : undefined}
          >
            <Text className="text-body font-semibold text-text-secondary">
              ×
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onPrimary}
        className={
          compact
            ? 'bg-primary rounded-button items-center py-3 mt-4'
            : 'bg-primary rounded-button items-center py-3.5 mt-5'
        }
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        testID={testID ? `${testID}-primary` : undefined}
      >
        <Text className="text-text-inverse text-body font-semibold">
          {primaryLabel}
        </Text>
      </Pressable>

      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          className="mt-3 items-center py-2"
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
          testID={testID ? `${testID}-secondary` : undefined}
        >
          <Text className="text-body text-text-secondary">
            {secondaryLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
