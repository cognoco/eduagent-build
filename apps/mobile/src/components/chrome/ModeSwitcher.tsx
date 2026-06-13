import { View, Pressable, Text, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { useScreenTopInset } from '../../lib/use-screen-top-inset';
import { useModeSwitch } from '../../lib/use-mode-switch';

/**
 * ModeSwitcher - app-shell chrome component.
 *
 * Self-gating: renders nothing when the navigation contract says the mode
 * switcher should be hidden. The contract owns both V1 chrome and legacy V0
 * fallback visibility, keeping this component free of raw owner/proxy/mode
 * gates.
 * When visible it shows two pressable buttons — Study and Family — with the
 * currently active one marked selected via accessibilityState. While a switch
 * is in flight both buttons are disabled and the requested side shows a
 * spinner. If the switch fails an inline error row appears with a dismiss
 * affordance so the failure is visible instead of a silent no-op.
 */
export function ModeSwitcher(): React.ReactElement | null {
  const { t } = useTranslation();
  const contract = useNavigationContract();
  const { switchMode, isSwitching, switchError, dismissError } =
    useModeSwitch();
  const insets = useScreenTopInset();

  if (contract.chrome.modeSwitcher === 'hidden') {
    return null;
  }

  const currentMode = contract.effectiveAppContext;

  return (
    <View
      testID="mode-switcher-container"
      className="bg-background"
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        testID="mode-switcher"
        className="flex-row items-center gap-1 px-4 py-2 bg-background"
        accessibilityRole="toolbar"
      >
        <Pressable
          testID="mode-switcher-study"
          onPress={() => switchMode('study')}
          disabled={isSwitching}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.myLearning')}
          accessibilityState={{
            selected: currentMode === 'study',
            disabled: isSwitching,
          }}
          className={`px-3 py-1.5 rounded-full border flex-row items-center ${
            currentMode === 'study'
              ? 'bg-primary border-primary'
              : 'bg-surface border-border'
          } ${isSwitching ? 'opacity-60' : ''}`}
        >
          {isSwitching && switchError !== 'study' && currentMode !== 'study' ? (
            <ActivityIndicator
              testID="mode-switcher-study-spinner"
              size="small"
              className="me-1"
              accessibilityLabel={t('common.loading')}
            />
          ) : null}
          <Text
            className={`text-body-sm font-semibold ${
              currentMode === 'study'
                ? 'text-on-primary'
                : 'text-text-secondary'
            }`}
          >
            {t('tabs.myLearning')}
          </Text>
        </Pressable>

        <Pressable
          testID="mode-switcher-family"
          onPress={() => switchMode('family')}
          disabled={isSwitching}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.children')}
          accessibilityState={{
            selected: currentMode === 'family',
            disabled: isSwitching,
          }}
          className={`px-3 py-1.5 rounded-full border flex-row items-center ${
            currentMode === 'family'
              ? 'bg-primary border-primary'
              : 'bg-surface border-border'
          } ${isSwitching ? 'opacity-60' : ''}`}
        >
          {isSwitching &&
          switchError !== 'family' &&
          currentMode !== 'family' ? (
            <ActivityIndicator
              testID="mode-switcher-family-spinner"
              size="small"
              className="me-1"
              accessibilityLabel={t('common.loading')}
            />
          ) : null}
          <Text
            className={`text-body-sm font-semibold ${
              currentMode === 'family'
                ? 'text-on-primary'
                : 'text-text-secondary'
            }`}
          >
            {t('tabs.children')}
          </Text>
        </Pressable>
      </View>

      {switchError ? (
        <View
          testID="mode-switcher-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="flex-row items-center justify-between px-4 py-2 bg-error-soft border-t border-error/30"
        >
          <Text className="flex-1 text-body-sm text-error me-3">
            {t('modeSwitcher.switchError')}
          </Text>
          <Pressable
            testID="mode-switcher-error-retry"
            onPress={() => switchMode(switchError)}
            accessibilityRole="button"
            accessibilityLabel={t('modeSwitcher.a11yRetry')}
            className="px-3 py-1 rounded-full bg-error"
          >
            <Text className="text-body-sm font-semibold text-on-error">
              {t('common.retry')}
            </Text>
          </Pressable>
          <Pressable
            testID="mode-switcher-error-dismiss"
            onPress={dismissError}
            accessibilityRole="button"
            accessibilityLabel={t('common.dismiss')}
            className="ms-2 px-2 py-1"
          >
            <Text className="text-body-sm text-text-secondary">✕</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
