import { Pressable, Text, View } from 'react-native';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { LEARNER_HOME_HREF } from '../../lib/navigation';
import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { type RouteKey, type RouteParams } from '../../lib/navigation-contract';
import { useEnterFamilyMode } from '../../lib/use-mode-switch';
import { Button } from '../common/Button';

// [PARENT-03] RequireFamilyContext is a READ-ONLY route guard.
// It renders children only when the user is already in Family mode.
// It must NOT silently call setMode() or navigate the user — mode mutations
// require explicit user intent (pressing the CTA below).
//
// Deep-route guards run through the navigation contract.
// Route consumers use contract.canEnter(route, params). Non-route consumers use
// the resolved family shape, with legacy V0 context preserved via contract
// state instead of raw feature flags.

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
  const [switchingToFamily, setSwitchingToFamily] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const { t } = useTranslation();

  const legacyFamilyContextActive =
    contract.shape !== 'family' &&
    (contract.effectiveAppContext === 'family' ||
      contract.gates.showFamilyHome);
  const canRender = route
    ? contract.canEnter(route, params) || legacyFamilyContextActive
    : contract.shape === 'family' || legacyFamilyContextActive;

  if (canRender && !switchingToFamily) {
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
    setSwitchingToFamily(true);
    enterFamilyMode({
      onSuccess: () => {
        setSwitchingToFamily(false);
      },
      onError: () => {
        // Server rejected the family-context switch (e.g. owner lost
        // family-link, or under-18 — the API guard in profile.ts.
        // Stay on this screen and surface an actionable error so the
        // user does not silently land on Home with mode unchanged.
        setSwitchingToFamily(false);
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
        <Button
          testID="family-route-switch-cta"
          disabled={switchingToFamily}
          label={t('guards.requireFamilyContext.switchCta')}
          className="mt-2 rounded-xl"
          onPress={handleSwitchToFamily}
        />
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
