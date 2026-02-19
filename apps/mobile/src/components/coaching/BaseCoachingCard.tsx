import { type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';

export interface BaseCoachingCardProps {
  headline: string;
  subtext?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  metadata?: ReactNode;
  footer?: ReactNode;
  isLoading?: boolean;
  onPress?: () => void;
  testID?: string;
}

function Skeleton(): ReactNode {
  return (
    <View
      className="bg-coaching-card rounded-card p-5 mt-4"
      accessibilityLabel="Loading coaching card"
      testID="coaching-card-skeleton"
    >
      <View className="bg-border rounded h-6 w-3/4 mb-3" />
      <View className="bg-border rounded h-4 w-1/2 mb-5" />
      <View className="bg-border rounded-button h-12 w-full" />
    </View>
  );
}

export function BaseCoachingCard({
  headline,
  subtext,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  metadata,
  footer,
  isLoading,
  onPress,
  testID,
}: BaseCoachingCardProps): ReactNode {
  if (isLoading) {
    return <Skeleton />;
  }

  const content = (
    <>
      <Text className="text-display font-bold text-text-primary leading-tight">
        {headline}
      </Text>
      {subtext && (
        <Text className="text-body text-text-secondary mt-2">{subtext}</Text>
      )}
      {metadata && <View className="mt-3">{metadata}</View>}
      <Pressable
        onPress={onPrimary}
        className="bg-primary rounded-button py-3.5 mt-5 items-center"
        style={{ minHeight: 48 }}
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        testID={testID ? `${testID}-primary` : undefined}
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
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
          testID={testID ? `${testID}-secondary` : undefined}
        >
          <Text className="text-text-secondary text-body">
            {secondaryLabel}
          </Text>
        </Pressable>
      )}
      {footer}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className="bg-coaching-card rounded-card p-5 mt-4"
        accessibilityRole="button"
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View className="bg-coaching-card rounded-card p-5 mt-4" testID={testID}>
      {content}
    </View>
  );
}
