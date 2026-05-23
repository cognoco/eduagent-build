import { View, Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { useParentProxy } from '../../hooks/use-parent-proxy';
import { useAppContext } from '../../lib/app-context';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { useModeSwitch } from '../../lib/use-mode-switch';

/**
 * ModeSwitcher - app-shell chrome component.
 *
 * Self-gating: renders nothing when neither the V1 navigation contract nor the
 * legacy V0 mode-nav fallback allows a mode switcher. When visible it shows two
 * pressable buttons - Study and Family - with the currently active one marked
 * selected via accessibilityState.
 */
export function ModeSwitcher(): React.ReactElement | null {
  const { t } = useTranslation();
  const contract = useNavigationContract();
  const { isParentProxy } = useParentProxy();
  const { mode: legacyMode, familyCapable } = useAppContext();
  const { switchMode } = useModeSwitch();

  const showV1Switcher = contract.chrome.modeSwitcher !== 'hidden';
  const showV0Switcher =
    !FEATURE_FLAGS.MODE_NAV_V1_ENABLED &&
    FEATURE_FLAGS.MODE_NAV_V0_ENABLED &&
    familyCapable &&
    !isParentProxy;

  if (!showV1Switcher && !showV0Switcher) {
    return null;
  }

  const currentMode =
    showV0Switcher && !showV1Switcher
      ? (legacyMode ?? 'study')
      : contract.effectiveAppContext;

  return (
    <View
      testID="mode-switcher"
      className="flex-row items-center gap-1 px-4 py-2 bg-background"
      accessibilityRole="toolbar"
    >
      <Pressable
        testID="mode-switcher-study"
        onPress={() => switchMode('study')}
        accessibilityRole="button"
        accessibilityState={{ selected: currentMode === 'study' }}
        className={`px-3 py-1.5 rounded-full border ${
          currentMode === 'study'
            ? 'bg-primary border-primary'
            : 'bg-surface border-border'
        }`}
      >
        <Text
          className={`text-body-sm font-semibold ${
            currentMode === 'study' ? 'text-on-primary' : 'text-text-secondary'
          }`}
        >
          {t('tabs.myLearning')}
        </Text>
      </Pressable>

      <Pressable
        testID="mode-switcher-family"
        onPress={() => switchMode('family')}
        accessibilityRole="button"
        accessibilityState={{ selected: currentMode === 'family' }}
        className={`px-3 py-1.5 rounded-full border ${
          currentMode === 'family'
            ? 'bg-primary border-primary'
            : 'bg-surface border-border'
        }`}
      >
        <Text
          className={`text-body-sm font-semibold ${
            currentMode === 'family' ? 'text-on-primary' : 'text-text-secondary'
          }`}
        >
          {t('tabs.children')}
        </Text>
      </Pressable>
    </View>
  );
}