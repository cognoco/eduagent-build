import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react-native';
import { useThemeColors } from '../lib/theme';
import { ErrorFallback } from '../components/common';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();

  // [M1] Timeout escape for Clerk auth loading spinner.
  // [#508] retryCount bumps when the user taps Retry — useEffect depends on it
  // so the 15s timer genuinely restarts instead of being a no-op hide.
  const [showTimeout, setShowTimeout] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    if (isLoaded) {
      setShowTimeout(false);
      return;
    }
    const timer = setTimeout(() => setShowTimeout(true), 15_000);
    return () => clearTimeout(timer);
    // retryCount is intentionally included: bumping it re-registers the 15s
    // timer so "Retry" is a real retry, not just hiding the timeout screen.
  }, [isLoaded, retryCount]);

  const onRetry = () => {
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'index: Clerk load timeout — user tapped Retry',
      level: 'warning',
      data: { retryCount: retryCount + 1 },
    });
    setShowTimeout(false);
    setRetryCount((c) => c + 1);
  };

  if (!isLoaded) {
    if (showTimeout) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title={t('auth.index.timeoutTitle')}
            message={t('auth.index.timeoutMessage')}
            primaryAction={{
              label: t('common.retry'),
              onPress: onRetry,
              testID: 'index-timeout-retry',
            }}
            secondaryAction={{
              label: t('auth.index.signInInstead'),
              onPress: () => router.replace('/(auth)/sign-in'),
              testID: 'index-timeout-sign-in',
            }}
          />
        </View>
      );
    }
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator
          size="large"
          color={colors.muted}
          testID="index-loading"
        />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(app)/home" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
