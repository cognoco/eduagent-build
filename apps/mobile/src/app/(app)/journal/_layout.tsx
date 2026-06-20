import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

// Seed the journal stack with `index` so a cross-stack deep push to a future
// journal child (e.g. `journal/report/[reportId]`) from another tab synthesizes
// a 2-deep stack (journal index underneath the detail screen) instead of a
// 1-deep stack. Without this, router.back() from a detail screen falls through
// to the Tabs first-route. See AGENTS.md → Repo-Specific Guardrails.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function JournalLayout(): React.JSX.Element {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
