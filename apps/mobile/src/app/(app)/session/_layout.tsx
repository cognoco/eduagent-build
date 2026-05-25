import { Redirect, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../lib/theme';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { useProfile } from '../../../lib/profile';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

export default function SessionLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigationContract = useNavigationContract();
  // Read isExplicitProxyMode directly so it updates immediately on profile
  // switch (WI-283: defence-in-depth beyond the Redirect fast path).
  const { isExplicitProxyMode } = useProfile();

  // When V1 is off the contract's canEnter() returns false during the
  // profile-load window (activeProfile===null) — which would redirect cold
  // deep-link entries to /home. Preserve the V0 behavior by using the legacy
  // isParentProxy check until V1 ships everywhere.
  // OR in `isExplicitProxyMode` directly: navigationContract.isParentProxy can
  // lag a profile switch by a render, leaving a window where a proxy user is
  // inside the session writes. The direct flag closes that window (WI-283).
  const blocked =
    (FEATURE_FLAGS.MODE_NAV_V1_ENABLED
      ? !navigationContract.canEnter('session')
      : navigationContract.isParentProxy) || isExplicitProxyMode;

  if (blocked) {
    return (
      <>
        <Redirect href="/(app)/home" />
        <View
          className="flex-1 bg-background items-center justify-center px-6"
          testID="session-proxy-fallback"
        >
          <Text className="text-body text-text-secondary text-center">
            {t('proxy.readOnly.hint')}
          </Text>
        </View>
      </>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
