import { Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';

// Seed the recaps stack with `index` so a cross-tab `router.replace` to
// `recaps/[recapId]` (e.g. from a session-leave with returnTo=family-recaps,
// or a deep-link) synthesizes a 2-deep stack — recaps list underneath the
// detail screen — instead of a 1-deep stack that drops to the Tabs first-route
// (Home) when the user presses Back. See AGENTS.md rule 15.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RecapsLayout(): React.JSX.Element {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[recapId]" getId={({ params }) => params?.recapId} />
    </Stack>
  );
}
