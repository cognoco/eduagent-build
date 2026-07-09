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
 *
 * [CR-2026-05-21-113] Path allowlist: even with the auth guard above, a
 * signed-in user on an E2E APK could be tricked by a malicious deep link into
 * seeding an arbitrary redirect target. `toInternalAppRedirectPath` sanitises
 * the structure but does not enforce an allowlist. We validate `path` against
 * the small set of routes actually used by the Maestro E2E flows; anything
 * outside the allowlist falls back to the safe default `/(app)/home`.
 */

import { useAuth } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { seedPendingAuthRedirectForTesting } from '../../lib/pending-auth-redirect';

const IS_E2E_BUILD =
  process.env.NODE_ENV !== 'production' &&
  process.env.EXPO_PUBLIC_E2E === 'true';

/**
 * [CR-2026-05-21-113] Allowlist of `path` values that Maestro E2E flows are
 * permitted to seed. Derived from every `openLink` call to this route in
 * `apps/mobile/e2e/flows/`:
 *   - `/(app)/library`  — deep-link-redirect-ttl-expired.yaml:48
 *
 * The safe default `/(app)/home` is always accepted because it is what the
 * component uses when `path` is absent. Any path outside this set is rejected
 * and the safe default is seeded instead.
 */
const SEED_PATH_ALLOWLIST = new Set(['/(app)/home', '/(app)/library']);

const SAFE_DEFAULT_PATH = '/(app)/home';

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
    // [CR-2026-05-21-113] Validate path against the allowlist before seeding.
    // An out-of-allowlist value (including any attacker-controlled path from a
    // malicious deep link) falls back to the safe default rather than being
    // passed to seedPendingAuthRedirectForTesting.
    const requestedPath = path ?? SAFE_DEFAULT_PATH;
    const seedPath = SEED_PATH_ALLOWLIST.has(requestedPath)
      ? requestedPath
      : SAFE_DEFAULT_PATH;
    seedPendingAuthRedirectForTesting(seedPath, staleMsNum);
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
