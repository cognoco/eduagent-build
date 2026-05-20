/**
 * Dev/E2E-only seed route — `mentomate:///dev-only/seed-pending-redirect`
 *
 * Reads `path` and `staleMs` from search params, calls
 * `seedPendingAuthRedirectForTesting`, then replaces to the sign-in screen.
 * Used by the `deep-link-redirect-ttl-expired.yaml` Maestro flow to write a
 * pre-aged pending-redirect record without waiting >5 min for the real TTL.
 *
 * This route is dead in production: if NODE_ENV === 'production' or
 * EXPO_PUBLIC_E2E !== 'true', the component renders null and the seed call is
 * never made.
 *
 * Requires the APK to be built with EXPO_PUBLIC_E2E=true.
 *
 * [CR-2026-05-19-H25] Auth guard: the seed call writes an arbitrary path
 * into SecureStore, which a subsequent sign-in will redirect into. In an
 * E2E APK (`EXPO_PUBLIC_E2E=true`) reachable via `adb shell am start`, an
 * unauthenticated actor could otherwise prime the next sign-in to land on
 * a route of their choosing. We require a signed-in Clerk session — Maestro
 * flows already sign in before navigating here, so this is a no-op for the
 * sanctioned E2E path while closing the unauthenticated entry point.
 */

import { useAuth } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { seedPendingAuthRedirectForTesting } from '../../lib/pending-auth-redirect';

const IS_E2E_BUILD =
  process.env.NODE_ENV !== 'production' &&
  process.env.EXPO_PUBLIC_E2E === 'true';

export default function SeedPendingRedirectScreen(): React.ReactElement | null {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { path, staleMs } = useLocalSearchParams<{
    path: string;
    staleMs: string;
  }>();

  useEffect(() => {
    if (!IS_E2E_BUILD) return;
    if (!isLoaded) return;
    if (!isSignedIn) {
      // [CR-2026-05-19-H25] Refuse to seed for unauthenticated callers — an
      // attacker on an E2E APK could otherwise plant a pending redirect that
      // hijacks the next sign-in. Bounce to sign-in instead of silently no-op
      // so the dead-end state is recoverable per UX Resilience Rules.
      router.replace('/(auth)/sign-in');
      return;
    }

    const staleMsNum = parseInt(staleMs ?? '0', 10);
    seedPendingAuthRedirectForTesting(path ?? '/(app)/home', staleMsNum);
    router.replace('/(auth)/sign-in');
  }, [isLoaded, isSignedIn, path, staleMs, router]);

  if (!IS_E2E_BUILD) {
    return null;
  }

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <View testID="pending-redirect-seeded">
      <Text>
        Seeding pending redirect (path={path ?? ''}, staleMs={staleMs ?? '0'})…
      </Text>
    </View>
  );
}
