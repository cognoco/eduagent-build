import { Redirect, Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

export default function HomeworkLayout(): React.JSX.Element {
  const colors = useThemeColors();
  const navigationContract = useNavigationContract();

  // V0 fallback: canEnter() blocks during profile-load when V1 is off — preserve
  // V0 behavior so cold deep-links don't redirect to /home. See H5.1 in branch CR.
  const blocked = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? !navigationContract.canEnter('homework')
    : navigationContract.isParentProxy;

  if (blocked) {
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
