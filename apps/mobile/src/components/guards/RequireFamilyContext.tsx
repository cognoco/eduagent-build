import { ActivityIndicator, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { useGuardFamilyRoute } from '../../lib/navigation';

export function RequireFamilyContext({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const { canRenderFamilyRoute, familyCapable, mode } = useGuardFamilyRoute();

  if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) {
    return <>{children}</>;
  }

  if (canRenderFamilyRoute) {
    return <>{children}</>;
  }

  if (familyCapable && mode !== 'family') {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="family-route-switching"
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      testID="family-route-no-access"
    >
      <Text className="text-body text-text-secondary text-center">
        Open Family mode to view this learning profile.
      </Text>
    </View>
  );
}
