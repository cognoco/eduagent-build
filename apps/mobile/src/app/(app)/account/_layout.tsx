import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../lib/theme';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';

export const unstable_settings = {
  initialRouteName: 'index',
};

export const ACCOUNT_PRESENTATION = 'modal' as const;

export default function AccountLayout(): React.ReactElement {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { isParentProxy } = useNavigationContract();

  if (isParentProxy) {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        presentation: ACCOUNT_PRESENTATION,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profiles" options={{ title: t('profiles.title') }} />
      <Stack.Screen
        name="notifications"
        options={{ title: t('more.subscreens.notifications') }}
      />
      <Stack.Screen
        name="privacy"
        options={{ title: t('more.subscreens.privacy') }}
      />
    </Stack>
  );
}
