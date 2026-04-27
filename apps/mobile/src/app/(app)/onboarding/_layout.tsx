import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

// Onboarding has multiple sequential screens; seed with `index` so a cross-tab
// deep push to any onboarding step (e.g. /onboarding/interview from a
// notification) does not synthesize a 1-deep stack that pops back to Home.
export const unstable_settings = {
  initialRouteName: 'index',
};

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
