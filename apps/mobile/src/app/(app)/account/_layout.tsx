import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export const ACCOUNT_PRESENTATION = 'modal' as const;

export default function AccountLayout(): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: ACCOUNT_PRESENTATION,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
