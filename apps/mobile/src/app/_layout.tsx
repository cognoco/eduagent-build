import '../../global.css';
import { useState, useEffect, useMemo } from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeContext, useTokenVars, type Persona } from '../lib/theme';
import type { ColorScheme } from '../lib/design-tokens';
import { ProfileProvider, useProfile } from '../lib/profile';
import { ErrorBoundary } from '../components/common';
import { initSentry } from '../lib/sentry';

// Initialize Sentry at module level — runs before any component renders
initSentry();

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
    },
  },
});

function ThemedApp() {
  const { activeProfile } = useProfile();
  const [persona, setPersona] = useState<Persona>('teen');
  const systemColorScheme = useColorScheme();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    (systemColorScheme as ColorScheme) ?? 'light'
  );

  // Derive persona from active profile's personaType
  useEffect(() => {
    if (activeProfile) {
      setPersona(activeProfile.personaType.toLowerCase() as Persona);
    }
  }, [activeProfile]);

  // Sync system color scheme changes
  useEffect(() => {
    if (systemColorScheme) {
      setColorScheme(systemColorScheme as ColorScheme);
    }
  }, [systemColorScheme]);

  const themeValue = useMemo(
    () => ({ persona, setPersona, colorScheme, setColorScheme }),
    [persona, colorScheme]
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

  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
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
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
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
    </GestureHandlerRootView>
  );
}
