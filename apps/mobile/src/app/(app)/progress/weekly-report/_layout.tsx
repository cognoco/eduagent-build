import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

export default function WeeklyReportLayout(): React.JSX.Element {
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
