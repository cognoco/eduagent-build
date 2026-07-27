import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SubjectHubLayout(): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
