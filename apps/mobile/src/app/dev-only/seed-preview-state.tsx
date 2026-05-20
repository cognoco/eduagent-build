/**
 * Dev/E2E-only preview-state seed route.
 *
 * Used by Maestro to exercise preview-onboarding TTL recovery without waiting
 * more than one hour. Dead in production and in non-E2E dev-client builds.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import {
  getPreviewState,
  seedPreviewStateForTesting,
  type PreviewIntent,
  type PreviewPath,
} from '../../lib/preview-onboarding-state';

const IS_E2E_BUILD =
  process.env.NODE_ENV !== 'production' &&
  process.env.EXPO_PUBLIC_E2E === 'true';

const VALID_INTENTS = new Set<PreviewIntent>([
  'self',
  'child',
  'both',
  'not_sure',
]);

function parseIntent(value: string | undefined): PreviewIntent {
  return value && VALID_INTENTS.has(value as PreviewIntent)
    ? (value as PreviewIntent)
    : 'self';
}

function defaultPathForIntent(intent: PreviewIntent): PreviewPath {
  return intent === 'child' || intent === 'both'
    ? 'parent_value_prop'
    : 'learner_value_prop';
}

export default function SeedPreviewStateScreen(): React.ReactElement | null {
  const router = useRouter();
  const [seeded, setSeeded] = useState(false);
  const { intent, path, topicText, staleMs } = useLocalSearchParams<{
    intent?: string;
    path?: string;
    topicText?: string;
    staleMs?: string;
  }>();

  useEffect(() => {
    if (!IS_E2E_BUILD) return;

    const run = async () => {
      const parsedIntent = parseIntent(intent);
      const parsedStaleMs = parseInt(staleMs ?? '0', 10);
      await seedPreviewStateForTesting(
        {
          intent: parsedIntent,
          path:
            (path as PreviewPath | undefined) ??
            defaultPathForIntent(parsedIntent),
          topicText,
          bothPriority: parsedIntent === 'both' ? 'child_first' : undefined,
          createdAt: new Date().toISOString(),
        },
        Number.isFinite(parsedStaleMs) ? parsedStaleMs : 0,
      );
      setSeeded(true);

      // Trigger lazy TTL deletion for expired-state E2E runs, then return to
      // the visible preview entry point.
      await getPreviewState();
      router.replace('/preview/intent');
    };

    void run();
  }, [intent, path, router, staleMs, topicText]);

  if (!IS_E2E_BUILD) {
    return null;
  }

  return (
    <View testID="preview-state-seeded">
      <Text>
        {seeded ? 'Preview state seeded' : 'Seeding preview state...'}
      </Text>
    </View>
  );
}
