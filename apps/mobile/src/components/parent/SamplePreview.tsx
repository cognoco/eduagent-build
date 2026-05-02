import { type ReactNode } from 'react';
import { View, Text } from 'react-native';

interface SamplePreviewProps {
  children: ReactNode;
  unlockMessage: string;
}

export function SamplePreview({
  children,
  unlockMessage,
}: SamplePreviewProps): React.ReactElement {
  return (
    <View
      className="relative overflow-hidden rounded-card"
      testID="sample-preview-container"
    >
      <View className="opacity-30" pointerEvents="none">
        {children}
      </View>
      <View
        className="absolute inset-0 items-center justify-center bg-surface/60 rounded-card px-4"
        testID="sample-preview-overlay"
      >
        <Text className="text-body-sm text-text-secondary text-center">
          {unlockMessage}
        </Text>
      </View>
    </View>
  );
}
