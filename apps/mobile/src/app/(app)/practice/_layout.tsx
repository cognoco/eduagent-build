import { Redirect, Stack } from 'expo-router';
import { useEntryGate } from '../../../hooks/use-entry-gate';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function PracticeLayout() {
  const blocked = useEntryGate('practice');

  if (blocked) {
    return <Redirect href="/(app)/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
