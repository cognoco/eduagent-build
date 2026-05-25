import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { withOpacity } from '../../lib/color-opacity';
import {
  getLoadingMotionPreset,
  LOADING_CONTEXT_BACKDROP_OPACITY,
  type LoadingMotionRole,
} from '../../lib/motion-presets';
import { useThemeColors } from '../../lib/theme';

interface LoadingMomentOverlayProps {
  animationTestID?: string;
  children?: ReactNode;
  message: string;
  panelTestID?: string;
  renderAnimation: (args: { size: number; testID?: string }) => ReactNode;
  role?: Extract<LoadingMotionRole, 'context'>;
  testID: string;
}

export function LoadingMomentOverlay({
  animationTestID,
  children,
  message,
  panelTestID,
  renderAnimation,
  role = 'context',
  testID,
}: LoadingMomentOverlayProps): ReactNode {
  const colors = useThemeColors();
  const preset = getLoadingMotionPreset(role);

  return (
    <View
      className="absolute inset-0 items-center justify-center px-5"
      style={{
        backgroundColor: withOpacity(
          colors.background,
          LOADING_CONTEXT_BACKDROP_OPACITY,
        ),
        elevation: 20,
        zIndex: 20,
      }}
      testID={testID}
    >
      <View
        className="w-full max-w-[320px] rounded-card border border-border bg-surface px-6 py-6 items-center"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
        }}
        testID={panelTestID}
      >
        {renderAnimation({ size: preset.size, testID: animationTestID })}
        <Text className="text-body-sm text-text-secondary mt-3 text-center">
          {message}
        </Text>
        {children}
      </View>
    </View>
  );
}
