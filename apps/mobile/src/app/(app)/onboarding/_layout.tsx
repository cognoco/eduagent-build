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
      {/* BKT-C.1 — profile-wide tutor language (ahead of subject interview) */}
      <Stack.Screen name="language-picker" />
      {/* BKT-C.1 — pronouns picker (self-skips when learner age < 13) */}
      <Stack.Screen name="pronouns" />
      <Stack.Screen name="interview" />
      {/* BKT-C.2 — per-interest context picker (school/free-time/both) */}
      <Stack.Screen name="interests-context" />
      <Stack.Screen name="analogy-preference" />
      <Stack.Screen name="curriculum-review" />
      <Stack.Screen name="language-setup" />
    </Stack>
  );
}
