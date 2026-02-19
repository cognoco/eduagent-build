import '../../global.css';
import { useState, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeContext, useTokenVars, type Persona } from '../lib/theme';
import { ProfileProvider, useProfile } from '../lib/profile';
import { ErrorBoundary } from '../components/common';

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

  // Derive persona from active profile's personaType
  useEffect(() => {
    if (activeProfile) {
      setPersona(activeProfile.personaType.toLowerCase() as Persona);
    }
  }, [activeProfile]);

  const themeValue = useMemo(() => ({ persona, setPersona }), [persona]);

  return (
    <ThemeContext.Provider value={themeValue}>
      <ThemedContent persona={persona} />
    </ThemeContext.Provider>
  );
}

/** Inner component that reads ThemeContext to inject CSS variables via vars() */
function ThemedContent({ persona }: { persona: Persona }) {
  const tokenVars = useTokenVars();

  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <StatusBar style={persona === 'teen' ? 'light' : 'dark'} />
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
