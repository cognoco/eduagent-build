import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

type CompletingTier = 'initial' | 'almost' | 'soft-fallback';

/**
 * Shown while a draft has `status: 'completing'` — the Inngest persist job is
 * running in the background. Escalates the copy at two time thresholds so the
 * user always knows what's happening and is never silently stuck.
 */
export function InterviewCompletingPanel() {
  const [tier, setTier] = useState<CompletingTier>('initial');

  useEffect(() => {
    const t1 = setTimeout(() => setTier('almost'), 15_000);
    const t2 = setTimeout(() => setTier('soft-fallback'), 60_000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const message =
    tier === 'initial'
      ? 'Building your learning path…'
      : tier === 'almost'
      ? 'Almost there — this can take up to 30 seconds.'
      : 'Still working — you can wait or come back later.';

  return (
    <View
      testID="interview-completing-panel"
      className="flex-1 items-center justify-center p-6"
    >
      <ActivityIndicator size="large" className="mb-4" />
      <Text className="text-body text-center text-text-secondary">
        {message}
      </Text>
    </View>
  );
}
