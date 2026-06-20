import { Pressable, Text, View } from 'react-native';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { LEARNER_HOME_HREF } from '../../lib/navigation';
import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { type RouteKey, type RouteParams } from '../../lib/navigation-contract';
import { useEnterFamilyMode } from '../../lib/use-mode-switch';

// [PARENT-03] RequireFamilyContext is a READ-ONLY route guard.
// It renders children only when the user is already in Family mode.
// It must NOT silently call setMode() or navigate the user — mode mutations
// require explicit user intent (pressing the CTA below).
//
// PR 4 migration: deep-route guards run through the navigation contract.
// V1 ON: gate via contract.canEnter(route, params) when a route is provided,
//        falling back to contract.shape === 'family' for non-route consumers.
// V1 OFF / V0 ON: gate via contract.effectiveAppContext === 'family' so the
//        legacy 5-tab production fallback keeps working.

export function RequireFamilyContext({
  children,
  route,
  params,
}: {
  children: ReactNode;
  route?: RouteKey;
  params?: RouteParams;
}): ReactNode {
  const router = useRouter();
  const enterFamilyMode = useEnterFamilyMode();
  const contract = useNavigationContract();
  const [switchFailed, setSwitchFailed] = useState(false);
  const { t } = useTranslation();

  if (
    !FEATURE_FLAGS.MODE_NAV_V0_ENABLED &&
    !FEATURE_FLAGS.MODE_NAV_V1_ENABLED
  ) {
    return children;
  }

  const canRender = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? route
      ? contract.canEnter(route, params)
      : contract.shape === 'family'
    : contract.effectiveAppContext === 'family';

  if (canRender) {
    return children;
  }

  // [PARENT-03] Study mode hit a family/child route.
  // Show an explicit opt-in CTA for family-capable users, or a plain
  // protected fallback for non-family-capable users. Never auto-mutate mode.

  function handleGoHome(): void {
    router.replace(LEARNER_HOME_HREF);
  }

  function handleSwitchToFamily(): void {
    setSwitchFailed(false);
    enterFamilyMode({
      onSuccess: () => {
        router.replace('/(app)/home');
      },
      onError: () => {
        // Server rejected the family-context switch (e.g. owner lost
        // family-link, or under-18 — the API guard in profile.ts.
        // Stay on this screen and surface an actionable error so the
        // user does not silently land on Home with mode unchanged.
        setSwitchFailed(true);
      },
    });
  }

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6 gap-4"
      testID="family-route-blocked"
    >
      <Text className="text-title-sm text-text-primary text-center">
        {t('guards.requireFamilyContext.title')}
      </Text>
      <Text className="text-body text-text-secondary text-center">
        {t('guards.requireFamilyContext.body')}
      </Text>

      {switchFailed && (
        <Text
          testID="family-route-switch-error"
          className="text-body-sm text-danger text-center"
        >
          {t('guards.requireFamilyContext.switchError')}
        </Text>
      )}

      {contract.isFamilyCapable && (
        <Pressable
          testID="family-route-switch-cta"
          className="mt-2 bg-primary rounded-xl px-6 py-3"
          onPress={handleSwitchToFamily}
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('guards.requireFamilyContext.switchCta')}
          </Text>
        </Pressable>
      )}

      <Pressable
        testID="family-route-back-home"
        className="mt-1 px-6 py-3"
        onPress={handleGoHome}
      >
        <Text className="text-body text-primary">
          {t('guards.requireFamilyContext.backToHome')}
        </Text>
      </Pressable>
    </View>
  );
}
