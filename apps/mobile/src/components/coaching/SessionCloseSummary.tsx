import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { BaseCoachingCard } from './BaseCoachingCard';

interface SessionCloseSummaryProps {
  headline: string;
  takeaways: string[];
  nextCheckIn?: string;
  bridgePrompt?: string;
  onBridgeAccept?: () => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

export function SessionCloseSummary({
  headline,
  takeaways,
  nextCheckIn,
  bridgePrompt,
  onBridgeAccept,
  onDismiss,
  isLoading,
}: SessionCloseSummaryProps): ReactNode {
  const metadata = (
    <View>
      {takeaways.map((takeaway, index) => (
        <View key={index} className="flex-row items-start mt-1">
          <Text className="text-body text-text-secondary me-2">{'\u2022'}</Text>
          <Text className="text-body text-text-primary flex-1">{takeaway}</Text>
        </View>
      ))}
      {nextCheckIn && (
        <Text className="text-caption text-text-secondary mt-3">
          {nextCheckIn}
        </Text>
      )}
    </View>
  );

  return (
    <BaseCoachingCard
      headline={headline}
      metadata={metadata}
      primaryLabel="Done"
      onPrimary={onDismiss}
      secondaryLabel={bridgePrompt}
      onSecondary={onBridgeAccept}
      isLoading={isLoading}
      testID="session-close-summary"
    />
  );
}
