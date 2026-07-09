import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../lib/theme';
import { Sentry } from '../lib/sentry';
import { ErrorFallback } from '../components/common';
import * as SecureStore from '../lib/secure-storage';
import { getPreviewState } from '../lib/preview-onboarding-state';
import {
  hasSeenPreAuthIntro,
  markPreAuthIntroSeenSync,
  preAuthIntroSecureStoreKey,
} from '../lib/intro-state';
import { getPostAuthDefaultPath } from './(app)/_lib/auth-redirect';

// Pre-auth routing destinations for the first-open probe. See
// docs/plans/2026-05-27-pre-auth-welcome-flow.md for the decision table.
type PreAuthRoute = '/(auth)/welcome' | '/(auth)/sign-in';
type PreAuthProbe =
  | { status: 'loading' }
  | { status: 'ready'; target: PreAuthRoute };

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

  // Pre-auth probe: once Clerk has loaded and the user is signed out, decide
  // whether to show the welcome cards (first open), the sign-in screen
  // (returning user), or the sign-in screen with the intro marked seen
  // (preview-state present — preview counts as the equivalent pre-auth
  // product explanation, see plan Failure Modes row 5).
  //
  // Errors fail open to /(auth)/sign-in (plan Failure Modes row 1) — never
  // trap the user before auth. Failure does NOT mark the intro seen, so the
  // welcome cards re-appear on the next cold open once SecureStore recovers.
  const [probe, setProbe] = useState<PreAuthProbe>({ status: 'loading' });

  useEffect(() => {
    if (!isLoaded || isSignedIn) {
      // Either auth is still loading or the user is signed in — neither path
      // needs the pre-auth probe. Reset to loading so a later sign-out
      // re-runs the probe cleanly.
      setProbe({ status: 'loading' });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [previewResult, introResult] = await Promise.allSettled([
          getPreviewState(),
          SecureStore.getItemAsync(preAuthIntroSecureStoreKey()),
        ]);

        if (cancelled) return;

        if (
          previewResult.status === 'fulfilled' &&
          previewResult.value !== null
        ) {
          // Preview state present: counts as the equivalent pre-auth product
          // explanation, mark the intro seen so the user doesn't see both
          // surfaces back-to-back on the next cold open. Then send them to
          // sign-in so the existing SaveWizard handoff can complete.
          markPreAuthIntroSeenSync();
          setProbe({ status: 'ready', target: '/(auth)/sign-in' });
          return;
        }

        if (previewResult.status === 'rejected') {
          Sentry.addBreadcrumb({
            category: 'pre-auth',
            level: 'warning',
            message: 'preview-state probe rejected — failing open to sign-in',
          });
          setProbe({ status: 'ready', target: '/(auth)/sign-in' });
          return;
        }

        if (introResult.status === 'rejected') {
          Sentry.addBreadcrumb({
            category: 'pre-auth',
            level: 'warning',
            message: 'pre-auth intro probe rejected — failing open to sign-in',
          });
          setProbe({ status: 'ready', target: '/(auth)/sign-in' });
          return;
        }

        const seen = hasSeenPreAuthIntro(introResult.value);
        setProbe({
          status: 'ready',
          target: seen ? '/(auth)/sign-in' : '/(auth)/welcome',
        });
      } catch (err) {
        if (cancelled) return;
        Sentry.addBreadcrumb({
          category: 'pre-auth',
          level: 'warning',
          message: 'pre-auth probe threw — failing open to sign-in',
        });
        Sentry.captureException(err);
        setProbe({ status: 'ready', target: '/(auth)/sign-in' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

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
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href={getPostAuthDefaultPath()} />;
  }

  if (probe.status === 'loading') {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator
          size="large"
          color={colors.muted}
          testID="index-loading"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  return <Redirect href={probe.target} />;
}
