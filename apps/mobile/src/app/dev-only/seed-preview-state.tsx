// gate: dev/test only — production users redirected to home.
/**
 * Dev/E2E-only preview-state seed route.
 *
 * Used by Maestro to exercise preview-onboarding TTL recovery without waiting
 * more than one hour. Dead in production and in non-E2E dev-client builds.
 */

import { useAuth } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import {
  getPreviewState,
  seedPreviewStateForTesting,
  type PreviewIntent,
  type PreviewPath,
} from '../../lib/preview-onboarding-state';

const IS_E2E_BUILD =
  __DEV__ &&
  process.env.NODE_ENV !== 'production' &&
  process.env.EXPO_PUBLIC_E2E === 'true';

const VALID_INTENTS = new Set<PreviewIntent>([
  'self',
  'child',
  'both',
  'not_sure',
]);

const VALID_PATHS = new Set<PreviewPath>([
  'learner_lesson',
  'learner_value_prop',
  'parent_value_prop',
]);

function parseIntent(value: string | undefined): PreviewIntent {
  return value && VALID_INTENTS.has(value as PreviewIntent)
    ? (value as PreviewIntent)
    : 'self';
}

function defaultPathForIntent(intent: PreviewIntent): PreviewPath {
  return intent === 'child' || intent === 'both'
    ? 'parent_value_prop'
    : 'learner_lesson';
}

function parsePath(
  value: string | undefined,
  intent: PreviewIntent,
): PreviewPath {
  return value && VALID_PATHS.has(value as PreviewPath)
    ? (value as PreviewPath)
    : defaultPathForIntent(intent);
}

export default function SeedPreviewStateScreen(): React.ReactElement | null {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { intent, path, topicText, staleMs } = useLocalSearchParams<{
    intent?: string;
    path?: string;
    topicText?: string;
    staleMs?: string;
  }>();

  useEffect(() => {
    if (!IS_E2E_BUILD) return;
    if (!isLoaded) return;
    if (!isSignedIn) {
      // [CR-2026-05-20-H3] Refuse to seed for unauthenticated callers — an
      // attacker on an E2E APK could plant arbitrary preview state that
      // manipulates the next preview-onboarding flow. Bounce to sign-in
      // so the dead-end state is recoverable per UX Resilience Rules.
      router.replace('/(auth)/sign-in');
      return;
    }

    const run = async () => {
      const parsedIntent = parseIntent(intent);
      const parsedPath = parsePath(path, parsedIntent);
      const parsedStaleMs = parseInt(staleMs ?? '0', 10);
      await seedPreviewStateForTesting(
        {
          intent: parsedIntent,
          path: parsedPath,
          topicText,
          bothPriority: parsedIntent === 'both' ? 'child_first' : undefined,
          createdAt: new Date().toISOString(),
        },
        Number.isFinite(parsedStaleMs) ? parsedStaleMs : 0,
      );

      // Trigger lazy TTL deletion for expired-state E2E runs, then return to
      // the visible preview entry point.
      await getPreviewState();
      router.replace('/preview/intent');
    };

    void run();
  }, [intent, isLoaded, isSignedIn, path, router, staleMs, topicText]);

  if (!IS_E2E_BUILD) {
    return <Redirect href="/(app)/home" />;
  }

  if (!isLoaded) {
    // Clerk still hydrating — show a minimal spinner so the screen doesn't
    // appear blank. The useEffect above will redirect once isLoaded flips.
    return (
      <View testID="seed-preview-auth-loading">
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!isSignedIn) {
    // Immediate redirect mirrors the useEffect bounce for the unauthenticated
    // case — prevents a blank-screen dead-end per UX Resilience Rules.
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <View testID="preview-state-seeded">
      <Text>Seeding preview state...</Text>
    </View>
  );
}
