import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/expo';

export default function PreviewLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect href="/(app)/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
