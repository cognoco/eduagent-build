import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

export default function OnboardingLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="interview" />
      <Stack.Screen name="analogy-preference" />
      <Stack.Screen name="curriculum-review" />
      <Stack.Screen name="language-setup" />
    </Stack>
  );
}
