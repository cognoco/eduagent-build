import { useEffect, useRef, useState } from 'react';
import {
  Stack,
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useThemeColors, useTokenVars } from '../../lib/theme';

import {
  readWebSearchParam,
  toInternalAppRedirectPath,
} from '../../lib/normalize-redirect-path';
import {
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';
import { getPostAuthDefaultPath } from '../(app)/_lib/auth-redirect';

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
    getPostAuthDefaultPath(),
  );
  // [F-175] Initialize ref without calling rememberPendingAuthRedirect (storage
  // write). The useEffect below handles persistence on mount and on changes.
  // Use peekPendingAuthRedirect() to restore a pre-existing remembered path
  // when no redirectTarget is present (e.g. returning to the auth screen).
  const redirectTargetRef = useRef(
    redirectTarget
      ? resolvedRedirectTarget
      : (peekPendingAuthRedirect() ?? resolvedRedirectTarget),
  );
  const lastRedirectedPathRef = useRef<string | null>(null);
  // [BUG-506] Track redirectTargetRef.current in state so the effect below
  // re-runs when a freshly-arrived deep-link changes the target while the user
  // is already signed in. Refs don't trigger effect re-runs on their own.
  const [effectiveTarget, setEffectiveTarget] = useState(
    () => redirectTargetRef.current,
  );

  // [F-175] Moved from render phase: rememberPendingAuthRedirect writes to
  // sessionStorage which is a side-effect and must not run during render.
  // useEffect fires when the redirectTarget or its resolved form changes and
  // keeps effectiveTarget + redirectTargetRef in sync without render-phase
  // storage writes.
  useEffect(() => {
    if (!redirectTarget) return;
    const remembered = rememberPendingAuthRedirect(resolvedRedirectTarget);
    if (remembered !== redirectTargetRef.current) {
      redirectTargetRef.current = remembered;
      setEffectiveTarget(remembered);
    }
  }, [redirectTarget, resolvedRedirectTarget]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      lastRedirectedPathRef.current = null;
      return;
    }

    if (lastRedirectedPathRef.current === effectiveTarget) {
      return;
    }

    lastRedirectedPathRef.current = effectiveTarget;
    router.replace(effectiveTarget as Href);
  }, [isLoaded, isSignedIn, router, effectiveTarget]);

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
