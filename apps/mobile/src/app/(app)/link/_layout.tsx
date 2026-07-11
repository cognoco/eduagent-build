import { Redirect, Stack } from 'expo-router';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { useThemeColors } from '../../../lib/theme';

export default function LinkLayout(): React.JSX.Element {
  const colors = useThemeColors();

  if (!FEATURE_FLAGS.MODE_NAV_V2_ENABLED) {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
