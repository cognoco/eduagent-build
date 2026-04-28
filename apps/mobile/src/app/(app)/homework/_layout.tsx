import { Redirect, Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';
import { useParentProxy } from '../../../hooks/use-parent-proxy';

export default function HomeworkLayout(): React.JSX.Element {
  const colors = useThemeColors();
  const { isParentProxy } = useParentProxy();

  if (isParentProxy) return <Redirect href="/(app)/home" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
