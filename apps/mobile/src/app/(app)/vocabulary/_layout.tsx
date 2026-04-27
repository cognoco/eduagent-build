import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

// Seed this nested stack with `index` so a cross-tab deep push to
// /vocabulary/[subjectId] synthesizes a 2-deep stack instead of a 1-deep stack.
// Without this, router.back() falls through to the Tabs first-route (Home).
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function VocabularyLayout(): React.JSX.Element {
  const colors = useThemeColors();
  return (
    <Stack
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
