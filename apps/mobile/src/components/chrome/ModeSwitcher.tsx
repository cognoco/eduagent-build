import { View, Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { useModeSwitch } from '../../lib/use-mode-switch';

/**
 * ModeSwitcher - app-shell chrome component.
 *
 * Self-gating: renders nothing when the navigation contract hides the switcher.
 * The contract owns both V1 chrome and legacy V0 fallback visibility, keeping
 * this component free of raw owner/proxy/mode gates.
 */
export function ModeSwitcher(): React.ReactElement | null {
  const { t } = useTranslation();
  const contract = useNavigationContract();
  const { switchMode } = useModeSwitch();

  if (contract.chrome.modeSwitcher === 'hidden') {
    return null;
  }

  const currentMode = contract.effectiveAppContext;

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