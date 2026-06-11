import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

// [BUG-137 / BUG-233] Seed this nested stack with `index` so a cross-tab deep
// push to `/(app)/my-notes/<kind>` synthesizes a 2-deep stack (my-notes
// overview underneath the kind list) instead of a 1-deep stack. Without
// this, `router.back()` from a kind list falls through to the Tabs
// first-route (Home) — a dead-end. Same pattern as
// shelf/[subjectId]/_layout.tsx and the new progress/[subjectId]/_layout.tsx.
// See AGENTS.md > Repo-Specific Guardrails ("Cross-tab / cross-stack
// router.push" and "unstable_settings").
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function MyNotesLayout() {
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
      <Stack.Screen name="[kind]" />
    </Stack>
  );
}
