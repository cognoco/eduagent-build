import '../../global.css';
import { ensureI18nReady } from '../i18n';
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
  useColorScheme,
} from 'react-native';
import * as SecureStore from '../lib/secure-storage';
import { platformAlert } from '../lib/platform-alert';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider, useClerk } from '@clerk/clerk-expo';
import { tokenCache as nativeTokenCache } from '@clerk/clerk-expo/token-cache';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useAuth } from '@clerk/clerk-expo';
import { ThemeContext, useThemeColors, useTokenVars } from '../lib/theme';
import { tokens } from '../lib/design-tokens';
import type { ColorScheme } from '../lib/design-tokens';
import { ProfileProvider, useProfile } from '../lib/profile';
import {
  setOnAuthExpired,
  clearOnAuthExpired,
  resetAuthExpiredGuard,
} from '../lib/api-client';
import { markSessionExpired } from '../lib/auth-expiry';
import { signOutWithCleanup } from '../lib/sign-out';
import { sanitizeSecureStoreKey } from '../lib/secure-storage';
import { ErrorBoundary, OfflineBanner } from '../components/common';
import { OutboxDrainProvider } from '../providers/OutboxDrainProvider';
import { useNetworkStatus } from '../hooks/use-network-status';
import { Sentry } from '../lib/sentry';
import { configureRevenueCat } from '../lib/revenuecat';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { asyncStoragePersister } from '../lib/query-persister';

// BUG-417: Clerk's default tokenCache uses expo-secure-store directly,
// which crashes on web. Use our secure-storage wrapper instead.
const webTokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key).catch(() => null),
  saveToken: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value).catch(() => undefined),
};
const tokenCache = Platform.OS === 'web' ? webTokenCache : nativeTokenCache;

// Initialize RevenueCat at module level — runs before any component renders.
// No-ops gracefully when API keys are not set (dev/web).
configureRevenueCat();

// Keep splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error(
    'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing. ' +
      'Add it to your .env.development.local file.',
  );
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Global fallback: report query failures to Sentry so silent blank
      // screens become observable even when a screen forgets to handle
      // isError, but ensures no failure goes unnoticed.
      Sentry.captureException(error, {
        tags: { queryKey: JSON.stringify(query.queryKey) },
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: 2,
      // Bug #7 fix: changed from 'online' to 'always'. The 'online' mode
      // pauses queries when the device is deemed offline, which causes
      // infinite skeleton loading when the API is unreachable but the device
      // has a network connection. With 'always', queries run immediately and
      // fail with a proper error that the UI can handle with retry buttons.
      // The OfflineBanner (from useNetworkStatus) still shows when offline.
      networkMode: 'always',
    },
  },
});

const ACCENT_STORE_PREFIX = 'accentPreset_';

function ThemedApp() {
  const { activeProfile, profiles } = useProfile();
  const { signOut } = useClerk();
  // Keep the latest profile list in a ref so the auth-expired callback
  // (registered once at mount) can pass current ids into signOutWithCleanup
  // without re-registering on every profile change.
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  // Always follow the phone's system color scheme (light/dark).
  const systemColorScheme = useColorScheme();
  const colorScheme: ColorScheme =
    (systemColorScheme as ColorScheme) ?? 'light';
  const [accentPresetId, setAccentPresetIdState] = useState<string | null>(
    null,
  );

  // BM-08: Load accent preset from SecureStore when profile changes.
  // Reset to null immediately on switch to prevent the previous profile's
  // accent from staying visible while the async load resolves.  The cleanup
  // function cancels stale lookups so a slower profile-A read can't overwrite
  // profile-B's selection.
  useEffect(() => {
    if (!activeProfile?.id) return;
    let cancelled = false;
    setAccentPresetIdState(null); // reset immediately
    // [I-4] Sanitize profileId before constructing the SecureStore key.
    const key = sanitizeSecureStoreKey(
      `${ACCENT_STORE_PREFIX}${activeProfile.id}`,
    );
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(key);
        if (!cancelled) setAccentPresetIdState(stored);
      } catch {
        if (!cancelled) setAccentPresetIdState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  // Register 401 handler: when a Clerk token expires mid-session the API
  // returns 401.  The api-client calls this callback which triggers signOut,
  // unmounting authenticated UI and redirecting to sign-in via layout guards.
  useEffect(() => {
    setOnAuthExpired(() => {
      if (__DEV__)
        console.warn(
          '[AUTH-DEBUG] onAuthExpired FIRED — clearing queries + signing out',
        );
      // BM-03 surface: tag the cache as session-expired so downstream UI can
      // distinguish "user signed out" from "user signed out due to an
      // expired token". signOutWithCleanup performs the actual cache clear,
      // SecureStore wipe, redirect cleanup, and Clerk signOut.
      markSessionExpired();
      // [BUG-630 / I-2] resetAuthExpiredGuard runs in finally so a failed
      // signOut still releases the guard — otherwise a subsequent 401 is
      // silently swallowed.
      void signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profilesRef.current.map((p) => p.id),
      })
        .catch(() => {
          platformAlert(
            'Could not sign you out',
            'Please close and reopen the app, then sign in again.',
          );
        })
        .finally(() => {
          resetAuthExpiredGuard();
        });
    });
    return () => clearOnAuthExpired();
  }, [signOut]);

  const setAccentPresetId = useCallback(
    (id: string | null) => {
      setAccentPresetIdState(id);
      if (!activeProfile?.id) return;
      // [I-4] Sanitize profileId before constructing the SecureStore key.
      const key = sanitizeSecureStoreKey(
        `${ACCENT_STORE_PREFIX}${activeProfile.id}`,
      );
      if (id) {
        SecureStore.setItemAsync(key, id).catch(Sentry.captureException);
      } else {
        SecureStore.deleteItemAsync(key).catch(Sentry.captureException);
      }
    },
    [activeProfile?.id],
  );

  // No-op setColorScheme — color scheme always follows system.
  // Kept in context interface to avoid breaking consumers.
  const setColorScheme = useCallback((_cs: ColorScheme): void => undefined, []);

  const themeValue = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      accentPresetId,
      setAccentPresetId,
    }),
    [colorScheme, setColorScheme, accentPresetId, setAccentPresetId],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <ThemedContent colorScheme={colorScheme} />
    </ThemeContext.Provider>
  );
}

/** Inner component that reads ThemeContext to inject CSS variables via vars() */
function ThemedContent({ colorScheme }: { colorScheme: ColorScheme }) {
  const tokenVars = useTokenVars();
  const colors = useThemeColors();
  const { isOffline } = useNetworkStatus();

  // Keep the authenticated app shell fully opaque. A release-only persona fade
  // here can get stuck mid-transition, leaving post-auth screens permanently
  // washed out and the tab bar looking covered by a haze.
  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {isOffline && <OfflineBanner />}
      <Stack
        screenOptions={{
          headerShown: false,
          // F-003/F-016/F-055: on web, stack screens are DOM layers without
          // native opaque backing. Give every screen a solid background so
          // the underlying tab/screen content doesn't bleed through.
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="sso-callback" />
        <Stack.Screen
          name="session-summary/[sessionId]"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="session-transcript/[sessionId]"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profiles"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="create-profile"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="consent"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="delete-account"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="create-subject"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="privacy"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="terms"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </View>
  );
}

/**
 * Replaces <ClerkLoaded> to avoid a white gap between splash dismissal and
 * Clerk initialization. ClerkLoaded renders NOTHING until Clerk is ready;
 * this component shows a themed spinner during the gap and signals readiness
 * back to the root layout so the splash doesn't dismiss prematurely.
 */
function ClerkGate({
  children,
  onReady,
  timedOut,
}: {
  children: React.ReactNode;
  onReady: () => void;
  timedOut: boolean;
}) {
  const { isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded) onReady();
  }, [isLoaded, onReady]);

  if (!isLoaded) {
    if (timedOut) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            Taking longer than expected
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: tokens.light.colors.muted,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            Please check your internet connection and try again.
          </Text>
          <Pressable
            onPress={() =>
              platformAlert(
                'Please restart',
                'Close the app completely and reopen it.',
              )
            }
            style={{
              backgroundColor: tokens.light.colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
            }}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text
              style={{
                color: tokens.light.colors.textInverse,
                fontWeight: '600',
                fontSize: 16,
              }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      );
    }
    return null;
  }

  return children as React.ReactElement;
}

/** Thin error boundary so AnimatedSplash crashes don't block the app. */
class SplashErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      '[AnimatedSplash] crashed:',
      error.message,
      info.componentStack,
    );
    Sentry.captureException(error, { tags: { component: 'AnimatedSplash' } });
    this.props.onError();
  }
  override render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
    ...Ionicons.font,
  });

  // i18n init pattern (b): folded into the existing fontsLoaded readiness
  // gate. Native splash (preventAutoHideAsync) stays visible until both
  // fonts and i18n resolve. Awaiting i18n eliminates flash-of-English for
  // non-English users; ensureI18nReady() is local AsyncStorage so cost is ~ms.
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    ensureI18nReady()
      .then(() => {
        if (!cancelled) setI18nReady(true);
      })
      .catch(() => {
        // AsyncStorage corruption (or any other init failure) must not soft-lock
        // the splash. Fall through to render with whatever i18n state we have —
        // i18next falls back to English if init never completed.
        if (!cancelled) setI18nReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Splash stays visible until BOTH conditions are met:
  //   1. The animated splash sequence has completed (or timed out)
  //   2. Clerk has finished initializing (app content is ready to render)
  // This prevents the white-screen gap that occurs when the splash dismisses
  // before ClerkLoaded resolves — especially on slower devices or with larger
  // JS bundles where Clerk init can take > 3 seconds.
  const [animDone, setAnimDone] = useState(false);
  const [clerkReady, setClerkReady] = useState(false);
  const [clerkTimedOut, setClerkTimedOut] = useState(false);
  const showSplash = !animDone || !clerkReady;

  const onAnimComplete = useCallback(() => {
    if (__DEV__) console.log('[Splash] Animation complete');
    setAnimDone(true);
  }, []);

  const onClerkReady = useCallback(() => {
    if (__DEV__) console.log('[Splash] Clerk ready');
    setClerkReady(true);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  // Safety: force-dismiss splash if animation callback never fires.
  useEffect(() => {
    if (animDone) return;
    const primary = setTimeout(() => {
      console.warn(
        '[Splash] Animation DISMISSED by primary timeout (3.5s) — callback never fired',
      );
      setAnimDone(true);
    }, 3500);
    const failsafe = setTimeout(() => {
      console.warn('[Splash] Animation DISMISSED by failsafe timeout (5s)');
      setAnimDone(true);
    }, 5000);
    return () => {
      clearTimeout(primary);
      clearTimeout(failsafe);
    };
  }, [animDone]);

  // Safety: if Clerk never loads (network issue, bad key), force-dismiss after
  // 12 seconds so the app doesn't stay on splash forever. The ClerkGate will
  // render null (Clerk still not loaded), but the SplashErrorBoundary will have
  // been removed, so at worst the user sees a white screen they can interact
  // with (sign-in redirect will kick in once Clerk eventually loads).
  useEffect(() => {
    if (clerkReady) return;
    const timeout = setTimeout(() => {
      console.warn(
        '[Splash] Clerk DISMISSED by failsafe timeout (12s) — Clerk not loaded',
      );
      setClerkTimedOut(true);
      setClerkReady(true);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [clerkReady]);

  useEffect(() => {
    if (fontsLoaded && i18nReady) {
      // Hide native splash — the AnimatedSplash component takes over
      SplashScreen.hideAsync();
      // [BUG-954] Fire-and-forget drift check — warns in console if the
      // deployed API is on a different commit than the local mobile build.
      if (__DEV__) {
        import('../lib/contract-drift-check').then((m) =>
          m.checkContractDrift(),
        );
      }
    }
  }, [fontsLoaded, i18nReady]);

  if (!fontsLoaded || !i18nReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          tokenCache={tokenCache}
        >
          <ClerkGate onReady={onClerkReady} timedOut={clerkTimedOut}>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{
                persister: asyncStoragePersister,
                maxAge: 24 * 60 * 60_000,
              }}
              onSuccess={() => {
                // [CCR finding, 2026-05-14] Drop legacy root keys after the
                // persister rehydrates AsyncStorage. PR 10 moved
                // `useEvaluateEligibility` from
                //   ['evaluate-eligibility', topicId, profileId]
                // to ['retention', 'evaluate-eligibility', topicId, profileId].
                // Warm-cache devices (any emulator with disk state from
                // pre-PR-10 builds) would otherwise carry orphaned eligibility
                // entries that no invalidation path reaches.
                queryClient.removeQueries({
                  queryKey: ['evaluate-eligibility'],
                });
              }}
            >
              <ProfileProvider>
                <OutboxDrainProvider>
                  <ErrorBoundary>
                    <ThemedApp />
                  </ErrorBoundary>
                </OutboxDrainProvider>
              </ProfileProvider>
            </PersistQueryClientProvider>
          </ClerkGate>
        </ClerkProvider>
      </SafeAreaProvider>
      {showSplash && (
        <SplashErrorBoundary onError={onAnimComplete}>
          <AnimatedSplash onComplete={onAnimComplete} />
        </SplashErrorBoundary>
      )}
    </GestureHandlerRootView>
  );
}
