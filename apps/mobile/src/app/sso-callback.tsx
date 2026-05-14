import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Sentry } from '../lib/sentry';

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
  const { t } = useTranslation();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // [AUTH-09] maybeCompleteAuthSession() is declared sync but the native
    // module can throw (or the return value can be a rejected Promise) on
    // Android when the in-app browser was dismissed without a real OAuth
    // result (network failure, user back-press, app backgrounded). We call it
    // synchronously (satisfying the "must call on mount" contract) and
    // defensively wrap the result in Promise.resolve so that any async
    // rejection is also caught. The 10s fallback button below gives the user
    // a visible escape, so we report and swallow.
    const handleError = (err: unknown) => {
      Sentry.captureException(err, {
        tags: { screen: 'SSOCallback', action: 'maybeCompleteAuthSession' },
      });
      if (__DEV__)
        console.warn('[AUTH-DEBUG] maybeCompleteAuthSession threw:', err);
    };
    try {
      void Promise.resolve(WebBrowser.maybeCompleteAuthSession()).catch(
        handleError,
      );
    } catch (err) {
      handleError(err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowFallback(true), SSO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator
        size="large"
        accessibilityLabel={t('auth.ssoCallback.loadingLabel')}
      />
      <Text className="text-body text-text-secondary mt-4">
        {t('auth.ssoCallback.finishing')}
      </Text>
      {showFallback && (
        <Pressable
          onPress={() => router.replace('/(auth)/sign-in')}
          className="mt-6 py-3 px-6"
          accessibilityLabel={t('auth.ssoCallback.backToSignIn')}
          accessibilityRole="button"
          testID="sso-fallback-back"
        >
          <Text className="text-primary text-body font-semibold">
            {t('auth.ssoCallback.backToSignIn')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
