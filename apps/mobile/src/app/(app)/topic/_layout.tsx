import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

// Seed the topic stack with `index` so a cross-tab deep push to a sibling
// (e.g. /topic/recall-test) synthesizes a 2-deep stack instead of leaving the
// user with no parent. Without this, router.back() falls through to the Tabs
// first-route (Home).
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TopicLayout(): React.JSX.Element {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[topicId]" getId={({ params }) => params?.topicId} />
    </Stack>
  );
}
