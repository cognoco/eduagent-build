import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

// [BUG-136] Seed this nested stack with `index` so a cross-tab deep push to
// `progress/[subjectId]/sessions` (or any future deeper screen) synthesizes a
// 2-deep stack (subject overview underneath sessions) instead of a 1-deep
// stack. Without this, `router.back()` from the sessions screen falls through
// to the Tabs first-route (Home) — a UX dead-end where the user loses their
// subject context. Same pattern as shelf/[subjectId]/_layout.tsx — see
// AGENTS.md > Repo-Specific Guardrails ("Cross-tab / cross-stack router.push"
// and "unstable_settings").
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SubjectProgressLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="sessions" />
    </Stack>
  );
}
