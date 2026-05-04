import React from 'react';
import { Platform, View } from 'react-native';

// [BUG-986/987] Post-auth gate screens (CreateProfileGate, ConsentPending,
// ConsentWithdrawn, etc.) render full-bleed and let `w-full` Pressables
// stretch the entire viewport on web. Wrap content in this constrained
// column so buttons read like a phone-sized layout on desktop browsers
// while staying full-width on native devices.
export const GATE_WEB_MAX_WIDTH = 480;

export function GateContent({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID?: string;
}): React.ReactElement {
  return (
    <View
      className="w-full"
      style={
        Platform.OS === 'web' ? { maxWidth: GATE_WEB_MAX_WIDTH } : undefined
      }
      testID={testID}
    >
      {children}
    </View>
  );
}
