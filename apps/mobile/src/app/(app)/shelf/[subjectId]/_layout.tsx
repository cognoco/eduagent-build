import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../lib/theme';

// Seed this nested stack with `index` so a cross-tab deep push to
// `shelf/[subjectId]/book/[bookId]` synthesizes a 2-deep stack (shelf index
// underneath book) instead of a 1-deep stack. Without this, `router.back()`
// from the book screen falls through to the Tabs first-route (Home).
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SubjectShelfLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="book/[bookId]"
        getId={({ params }) => params?.bookId}
      />
    </Stack>
  );
}
