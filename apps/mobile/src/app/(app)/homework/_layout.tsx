import { Redirect, Stack } from 'expo-router';
import { useThemeColors } from '../../../lib/theme';
import { useEntryGate } from '../../../hooks/use-entry-gate';

export default function HomeworkLayout(): React.JSX.Element {
  const colors = useThemeColors();
  const blocked = useEntryGate('homework');

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
