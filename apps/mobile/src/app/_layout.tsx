import '../../global.css';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import * as SecureStore from '../lib/secure-storage';
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
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { ThemeContext, useTokenVars, type Persona } from '../lib/theme';
import type { ColorScheme } from '../lib/design-tokens';
import {
  ProfileProvider,
  useProfile,
  personaFromBirthYear,
} from '../lib/profile';
import { setOnAuthExpired, clearOnAuthExpired } from '../lib/api-client';
import { markSessionExpired } from '../lib/auth-expiry';
import { ErrorBoundary, OfflineBanner } from '../components/common';
import { useNetworkStatus } from '../hooks/use-network-status';
import { Sentry } from '../lib/sentry';
import { configureRevenueCat } from '../lib/revenuecat';
import { AnimatedSplash } from '../components/AnimatedSplash';

// BUG-417: Clerk's default tokenCache uses expo-secure-store directly,
// which crashes on web. Use our secure-storage wrapper instead.
const webTokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value),
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
      'Add it to your .env.development.local file.'
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

function derivePersonaFromBirthYear(
  birthYear: number | null | undefined
): Persona {
  return personaFromBirthYear(birthYear);
}

function ThemedApp() {
  const { activeProfile } = useProfile();
  const { signOut } = useClerk();
  const [persona, setPersona] = useState<Persona>('teen');
  // Always follow the phone's system color scheme (light/dark).
  // Persona only controls accent colors and typography, not light/dark.
  const systemColorScheme = useColorScheme();
  const colorScheme: ColorScheme =
    (systemColorScheme as ColorScheme) ?? 'light';
  const [accentPresetId, setAccentPresetIdState] = useState<string | null>(
    null
  );

  // Derive persona from active profile birthYear (age-based visual theming).
  useEffect(() => {
    if (activeProfile) {
      setPersona(derivePersonaFromBirthYear(activeProfile.birthYear));
    }
  }, [activeProfile]);

  // BM-08: Load accent preset from SecureStore when profile changes.
  // Reset to null immediately on switch to prevent the previous profile's
  // accent from staying visible while the async load resolves.  The cleanup
  // function cancels stale lookups so a slower profile-A read can't overwrite
  // profile-B's selection.
  useEffect(() => {
    if (!activeProfile?.id) return;
    let cancelled = false;
    setAccentPresetIdState(null); // reset immediately
    const key = `${ACCENT_STORE_PREFIX}${activeProfile.id}`;
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
          '[AUTH-DEBUG] onAuthExpired FIRED — clearing queries + signing out'
        );
      // BM-03: clear cached query data before sign-out to prevent the next
      // user from seeing stale data from the previous session.
      markSessionExpired();
      queryClient.clear();
      void SecureStore.deleteItemAsync('hasSignedInBefore').catch(() => {});
      void signOut().catch(() => {
        Alert.alert(
          'Could not sign you out',
          'Please close and reopen the app, then sign in again.'
        );
      });
    });
    return () => clearOnAuthExpired();
  }, [signOut]);

  const setAccentPresetId = useCallback(
    (id: string | null) => {
      setAccentPresetIdState(id);
      if (!activeProfile?.id) return;
      const key = `${ACCENT_STORE_PREFIX}${activeProfile.id}`;
      if (id) {
        SecureStore.setItemAsync(key, id).catch(Sentry.captureException);
      } else {
        SecureStore.deleteItemAsync(key).catch(Sentry.captureException);
      }
    },
    [activeProfile?.id]
  );

  // No-op setColorScheme — color scheme always follows system.
  // Kept in context interface to avoid breaking consumers.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const setColorScheme = useCallback((_cs: ColorScheme) => {}, []);

  const themeValue = useMemo(
    () => ({
      persona,
      setPersona,
      colorScheme,
      setColorScheme,
      accentPresetId,
      setAccentPresetId,
    }),
    [
      persona,
      setPersona,
      colorScheme,
      setColorScheme,
      accentPresetId,
      setAccentPresetId,
    ]
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
  const { isOffline } = useNetworkStatus();

  // Keep the authenticated app shell fully opaque. A release-only persona fade
  // here can get stuck mid-transition, leaving post-auth screens permanently
  // washed out and the tab bar looking covered by a haze.
  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {isOffline && <OfflineBanner />}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="sso-callback" />
        <Stack.Screen
          name="assessment"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="session-summary"
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
              color: '#888',
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            Please check your internet connection and try again.
          </Text>
          <Pressable
            onPress={() =>
              Alert.alert(
                'Please restart',
                'Close the app completely and reopen it.'
              )
            }
            style={{
              backgroundColor: '#0d9488',
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
            }}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
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
      info.componentStack
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

  // Safety: force-dismiss splash if animation callback never fires.
  useEffect(() => {
    if (animDone) return;
    const primary = setTimeout(() => {
      console.warn(
        '[Splash] Animation DISMISSED by primary timeout (3.5s) — callback never fired'
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
        '[Splash] Clerk DISMISSED by failsafe timeout (12s) — Clerk not loaded'
      );
      setClerkTimedOut(true);
      setClerkReady(true);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [clerkReady]);

  useEffect(() => {
    if (fontsLoaded) {
      // Hide native splash — the AnimatedSplash component takes over
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          tokenCache={tokenCache}
        >
          <ClerkGate onReady={onClerkReady} timedOut={clerkTimedOut}>
            <QueryClientProvider client={queryClient}>
              <ProfileProvider>
                <ErrorBoundary>
                  <ThemedApp />
                </ErrorBoundary>
              </ProfileProvider>
            </QueryClientProvider>
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
