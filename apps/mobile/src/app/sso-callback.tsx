import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

const SSO_TIMEOUT_MS = 10_000;

/**
 * OAuth SSO callback route.
 *
 * Clerk redirects here after the user completes OAuth consent in the
 * in-app browser. `maybeCompleteAuthSession()` closes the browser
 * and hands the auth result back to the `useSSO` hook.
 *
 * If the callback doesn't complete within 10 seconds, a "Back to sign in"
 * button appears so the user is never trapped on this screen.
 */
export default function SSOCallbackScreen() {
  const router = useRouter();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.maybeCompleteAuthSession();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowFallback(true), SSO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator size="large" />
      <Text className="text-body text-text-secondary mt-4">
        Finishing sign-in...
      </Text>
      {showFallback && (
        <Pressable
          onPress={() => router.replace('/(auth)/sign-in')}
          className="mt-6 py-3 px-6"
          accessibilityLabel="Back to sign in"
          accessibilityRole="button"
          testID="sso-fallback-back"
        >
          <Text className="text-primary text-body font-semibold">
            Back to sign in
          </Text>
        </Pressable>
      )}
    </View>
  );
}
