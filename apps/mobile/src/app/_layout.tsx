import '../../global.css';
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { View, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
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
import { ClerkProvider, ClerkLoaded, useClerk } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import {
  ThemeContext,
  useTheme,
  useTokenVars,
  type Persona,
} from '../lib/theme';
import type { ColorScheme } from '../lib/design-tokens';
import { ProfileProvider, useProfile } from '../lib/profile';
import { setOnAuthExpired, clearOnAuthExpired } from '../lib/api-client';
import { ErrorBoundary, OfflineBanner } from '../components/common';
import { useNetworkStatus } from '../hooks/use-network-status';
import { Sentry } from '../lib/sentry';
import { configureRevenueCat } from '../lib/revenuecat';
import { AnimatedSplash } from '../components/AnimatedSplash';

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

/** Map persona to its designed color scheme */
function schemeForPersona(p: Persona): ColorScheme {
  switch (p) {
    case 'teen':
      return 'dark';
    case 'learner':
      return 'dark';
    case 'parent':
      return 'light';
    default:
      return 'dark';
  }
}

function ThemedApp() {
  const { activeProfile } = useProfile();
  const { signOut } = useClerk();
  const [persona, setPersona] = useState<Persona>('teen');
  const systemColorScheme = useColorScheme();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    (systemColorScheme as ColorScheme) ?? 'light'
  );
  const [accentPresetId, setAccentPresetIdState] = useState<string | null>(
    null
  );
  // Track whether the user has explicitly selected a persona/scheme.
  // When true, system color scheme changes are ignored (Bug #1 fix).
  const userExplicitChoice = useRef(false);

  // Derive persona + color scheme from active profile's personaType.
  // Must set both together — raw setPersona without setColorScheme leaves
  // the parent persona stuck in dark mode (themeKey mismatch).
  useEffect(() => {
    if (activeProfile) {
      const candidate = activeProfile.personaType.toLowerCase();
      if (
        candidate === 'teen' ||
        candidate === 'learner' ||
        candidate === 'parent'
      ) {
        setPersona(candidate);
        setColorScheme(schemeForPersona(candidate as Persona));
      }
    }
  }, [activeProfile]);

  // Sync system color scheme changes ONLY when user hasn't explicitly chosen.
  // Bug #1: Previously this unconditionally overrode the scheme, causing
  // "Parent (Light)" to render as dark when the system was in dark mode.
  useEffect(() => {
    if (systemColorScheme && !userExplicitChoice.current) {
      setColorScheme(systemColorScheme as ColorScheme);
    }
  }, [systemColorScheme]);

  // Load accent preset from SecureStore when profile changes
  useEffect(() => {
    if (!activeProfile?.id) return;
    const key = `${ACCENT_STORE_PREFIX}${activeProfile.id}`;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(key);
        setAccentPresetIdState(stored);
      } catch {
        setAccentPresetIdState(null);
      }
    })();
  }, [activeProfile?.id]);

  // Register 401 handler: when a Clerk token expires mid-session the API
  // returns 401.  The api-client calls this callback which triggers signOut,
  // unmounting authenticated UI and redirecting to sign-in via layout guards.
  useEffect(() => {
    setOnAuthExpired(() => {
      void signOut();
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

  // Wrap setPersona to also update the color scheme to the persona's
  // designed default and mark that the user made an explicit choice.
  const setPersonaWithScheme = useCallback((p: Persona) => {
    userExplicitChoice.current = true;
    setPersona(p);
    setColorScheme(schemeForPersona(p));
  }, []);

  const themeValue = useMemo(
    () => ({
      persona,
      setPersona: setPersonaWithScheme,
      colorScheme,
      setColorScheme,
      accentPresetId,
      setAccentPresetId,
    }),
    [
      persona,
      setPersonaWithScheme,
      colorScheme,
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
  const { persona } = useTheme();
  const { isOffline } = useNetworkStatus();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const prevPersona = useRef(persona);

  useEffect(() => {
    if (prevPersona.current !== persona && !reduceMotion) {
      // Brief fade on persona switch without destroying the React tree
      opacity.value = 0.6;
      opacity.value = withTiming(1, { duration: 250 });
    }
    prevPersona.current = persona;
  }, [persona, reduceMotion, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    flex: 1,
  }));

  // Previously used key={themeKey} to force NativeWind CSS variable propagation
  // (Bug #6). REMOVED: the key-based remount destroys the entire navigation
  // tree, which crashes Android Fabric when FragmentManager is mid-transaction
  // (Sentry MENTOMATE-MOBILE-6: IllegalStateException). NativeWind vars()
  // style updates propagate without remounting — the key was overkill.
  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {isOffline && <OfflineBanner />}
      <Animated.View style={fadeStyle}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(learner)" />
          <Stack.Screen name="(parent)" />
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
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="create-profile"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="consent"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="delete-account"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="create-subject"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="privacy"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="terms"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </Animated.View>
    </View>
  );
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
  override componentDidCatch() {
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
  const [showSplash, setShowSplash] = useState(true);

  const dismissSplash = useCallback(() => setShowSplash(false), []);

  // Safety timeout: force-dismiss splash after 3.5s if animation callback never fires.
  // Bug #9 fix: reduced from 4s → 3.5s primary, plus a hard 5s failsafe that
  // always fires regardless of React lifecycle / Reanimated callback issues.
  useEffect(() => {
    if (!showSplash) return;
    const primary = setTimeout(dismissSplash, 3500);
    const failsafe = setTimeout(() => setShowSplash(false), 5000);
    return () => {
      clearTimeout(primary);
      clearTimeout(failsafe);
    };
  }, [showSplash, dismissSplash]);

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
          <ClerkLoaded>
            <QueryClientProvider client={queryClient}>
              <ProfileProvider>
                <ErrorBoundary>
                  <ThemedApp />
                </ErrorBoundary>
              </ProfileProvider>
            </QueryClientProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </SafeAreaProvider>
      {showSplash && (
        <SplashErrorBoundary onError={dismissSplash}>
          <AnimatedSplash onComplete={dismissSplash} />
        </SplashErrorBoundary>
      )}
    </GestureHandlerRootView>
  );
}
