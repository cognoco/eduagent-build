import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function PreviewLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      didRedirectRef.current = false;
      return;
    }
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;
    router.replace('/(app)/home');
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}
