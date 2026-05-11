import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

export const unstable_settings = {
  initialRouteName: '[weeklyReportId]',
};

export default function WeeklyReportLayout(): React.JSX.Element {
  const colors = useThemeColors();
  return (
    <Stack
      initialRouteName="[weeklyReportId]"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
