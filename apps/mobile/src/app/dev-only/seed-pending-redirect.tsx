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
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { seedPendingAuthRedirectForTesting } from '../../lib/pending-auth-redirect';

const IS_E2E_BUILD =
  process.env.NODE_ENV !== 'production' &&
  process.env.EXPO_PUBLIC_E2E === 'true';

export default function SeedPendingRedirectScreen(): React.ReactElement | null {
  const router = useRouter();
  const { path, staleMs } = useLocalSearchParams<{
    path: string;
    staleMs: string;
  }>();

  useEffect(() => {
    if (!IS_E2E_BUILD) return;

    const staleMsNum = parseInt(staleMs ?? '0', 10);
    seedPendingAuthRedirectForTesting(path ?? '/(app)/home', staleMsNum);
    router.replace('/(auth)/sign-in');
  }, [path, staleMs, router]);

  if (!IS_E2E_BUILD) {
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
