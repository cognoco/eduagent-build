import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../lib/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function MoreLayout(): React.JSX.Element {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <Stack
      initialRouteName="index"
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="learning-preferences"
        options={{ headerShown: false }}
      />
      <Stack.Screen name="accommodation" options={{ headerShown: false }} />
      <Stack.Screen
        name="notifications"
        options={{ title: t('more.subscreens.notifications') }}
      />
      <Stack.Screen
        name="account"
        options={{ title: t('more.subscreens.account') }}
      />
      <Stack.Screen
        name="privacy"
        options={{ title: t('more.subscreens.privacy') }}
      />
      <Stack.Screen
        name="help"
        options={{ title: t('more.subscreens.help') }}
      />
    </Stack>
  );
}
