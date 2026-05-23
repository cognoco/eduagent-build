import { Redirect, Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';

export default function SessionLayout(): React.JSX.Element {
  const colors = useThemeColors();
  const navigationContract = useNavigationContract();

  if (!navigationContract.canEnter('session')) {
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
