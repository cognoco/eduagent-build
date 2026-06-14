import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ExplainedRedirect } from '../../../components/common/ExplainedRedirect';
import { useThemeColors } from '../../../lib/theme';
import { useEntryGate } from '../../../hooks/use-entry-gate';

export default function SessionLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const blocked = useEntryGate('session');

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
