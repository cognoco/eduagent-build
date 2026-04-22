import { useEffect, useRef } from 'react';
import {
  Stack,
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useThemeColors, useTokenVars } from '../../lib/theme';

import {
  readWebSearchParam,
  toInternalAppRedirectPath,
} from '../../lib/normalize-redirect-path';
import {
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';

export default function AuthRoutesLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const localParams = useLocalSearchParams<{
    redirectTo?: string | string[];
  }>();
  const globalParams = useGlobalSearchParams<{
    redirectTo?: string | string[];
  }>();
  const tokenVars = useTokenVars();
  const colors = useThemeColors();
  const localRedirectTarget = Array.isArray(localParams.redirectTo)
    ? localParams.redirectTo[0]
    : localParams.redirectTo;
  const globalRedirectTarget = Array.isArray(globalParams.redirectTo)
    ? globalParams.redirectTo[0]
    : globalParams.redirectTo;
  const browserRedirectTarget = readWebSearchParam('redirectTo');
  // [BUG-530] On web, prefer browserRedirectTarget (URLSearchParams.get()
  // always percent-decodes) over Expo Router's useLocalSearchParams which
  // may pass through raw percent-encoded values like %2F(app)%2Fquiz.
  // normalizeRedirectPath rejects values that don't start with '/', so an
  // un-decoded %2F... falls back to /home and the original deep-link is lost.
  const redirectTarget =
    browserRedirectTarget ?? localRedirectTarget ?? globalRedirectTarget;
  const resolvedRedirectTarget = toInternalAppRedirectPath(
    redirectTarget ?? undefined,
    '/(app)/home'
  );
  const redirectTargetRef = useRef(
    redirectTarget
      ? rememberPendingAuthRedirect(resolvedRedirectTarget)
      : peekPendingAuthRedirect() ?? resolvedRedirectTarget
  );
  const lastRedirectedPathRef = useRef<string | null>(null);

  if (redirectTarget) {
    // Preserve the original deep-link target across the signed-in transition.
    // Expo Router clears auth-route search params during the handoff, and
    // falling back to /home here breaks W-03 deep-link restoration on web.
    redirectTargetRef.current = rememberPendingAuthRedirect(
      resolvedRedirectTarget
    );
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      lastRedirectedPathRef.current = null;
      return;
    }

    if (lastRedirectedPathRef.current === redirectTargetRef.current) {
      return;
    }

    lastRedirectedPathRef.current = redirectTargetRef.current;
    router.replace(redirectTargetRef.current as never);
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) return null;
  if (isSignedIn) {
    return (
      <View
        style={[{ flex: 1, backgroundColor: colors.background }, tokenVars]}
        testID="auth-redirecting"
      />
    );
  }

  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </View>
  );
}
