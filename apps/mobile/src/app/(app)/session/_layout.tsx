import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ExplainedRedirect } from '../../../components/common/ExplainedRedirect';
import { useThemeColors } from '../../../lib/theme';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

export default function SessionLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigationContract = useNavigationContract();

  // When V1 is off the contract's canEnter() returns false during the
  // profile-load window (activeProfile===null) — which would redirect cold
  // deep-link entries to /home. Preserve the V0 behavior by using the legacy
  // isParentProxy check until V1 ships everywhere.
  const blocked = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? !navigationContract.canEnter('session')
    : navigationContract.isParentProxy;

  if (blocked) {
    return (
      <ExplainedRedirect
        href="/(app)/home"
        title={t('proxy.readOnly.title')}
        message={t('proxy.readOnly.hint')}
        ctaLabel={t('proxy.readOnly.switchProfileCta')}
        testID="session-proxy-fallback"
        ctaTestID="session-proxy-switch-profile"
      />
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
