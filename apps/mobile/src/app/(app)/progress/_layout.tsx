import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

export default function ProgressLayout(): React.JSX.Element {
  const colors = useThemeColors();
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="[subjectId]"
        getId={({ params }) => params?.subjectId}
      />
    </Stack>
  );
}
