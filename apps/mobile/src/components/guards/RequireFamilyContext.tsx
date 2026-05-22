import { Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';

import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { LEARNER_HOME_HREF } from '../../lib/navigation';
import { useGuardFamilyRoute } from '../../lib/navigation';
import { useAppContext } from '../../lib/app-context';

// [PARENT-03] RequireFamilyContext is a READ-ONLY route guard.
// It renders children only when the user is already in Family mode.
// It must NOT silently call setMode() or navigate the user — mode mutations
// require explicit user intent (pressing the CTA below).

export function RequireFamilyContext({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const router = useRouter();
  const { setMode } = useAppContext();
  const { canRenderFamilyRoute, familyCapable } = useGuardFamilyRoute();

  if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) {
    return <>{children}</>;
  }

  // Happy path: user is already in Family mode.
  if (canRenderFamilyRoute) {
    return <>{children}</>;
  }

  // [PARENT-03] Study mode hit a family/child route.
  // Show an explicit opt-in CTA for family-capable users, or a plain
  // protected fallback for non-family-capable users. Never auto-mutate mode.

  function handleGoHome(): void {
    router.replace(LEARNER_HOME_HREF);
  }

  function handleSwitchToFamily(): void {
    setMode('family');
    router.replace('/(app)/home');
  }

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6 gap-4"
      testID="family-route-blocked"
    >
      <Text className="text-title-sm text-text-primary text-center">
        This is a family view
      </Text>
      <Text className="text-body text-text-secondary text-center">
        Child learning profiles are only visible in Family mode.
      </Text>

      {familyCapable && (
        <Pressable
          testID="family-route-switch-cta"
          className="mt-2 bg-primary rounded-xl px-6 py-3"
          onPress={handleSwitchToFamily}
        >
          <Text className="text-body font-semibold text-white">
            Switch to Family mode
          </Text>
        </Pressable>
      )}

      <Pressable
        testID="family-route-back-home"
        className="mt-1 px-6 py-3"
        onPress={handleGoHome}
      >
        <Text className="text-body text-primary">Back to Home</Text>
      </Pressable>
    </View>
  );
}
