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
      className="overflow-hidden rounded-card"
      testID="sample-preview-container"
    >
      <View pointerEvents="none">{children}</View>
      <View
        className="border-t border-border bg-surface px-4 py-3"
        testID="sample-preview-overlay"
      >
        <Text className="text-body-sm text-text-secondary text-center">
          {unlockMessage}
        </Text>
      </View>
    </View>
  );
}
