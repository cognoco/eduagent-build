import { Stack } from 'expo-router';

export default function SessionLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
