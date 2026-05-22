import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

// [BUG-404] Seed the shelf stack with `index` so a cross-stack deep push to
// `shelf/[subjectId]/book/[bookId]` from another tab synthesizes a 2-deep stack
// (shelf index underneath the book screen) instead of a 1-deep stack. Without
// this, router.back() from the book screen falls through to the Tabs first-route
// (Home) because there is no shelf index in the back stack.
export const unstable_settings = {
  initialRouteName: '[subjectId]',
};

export default function ShelfLayout(): React.JSX.Element {
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
