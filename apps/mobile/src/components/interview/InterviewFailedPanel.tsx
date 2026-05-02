import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { PersistFailureCode } from '@eduagent/schemas';
import { useRetryInterviewPersist } from '../../hooks/use-interview';
import { goBackOrReplace } from '../../lib/navigation';

interface Props {
  subjectId: string;
  bookId?: string;
  failureCode: PersistFailureCode | null;
}

const COPY: Record<string, string> = {
  extract_signals_failed:
    "We couldn't understand the conversation well enough to build your path.",
  empty_signals: "We didn't get enough to work with from the chat.",
  generate_curriculum_failed: 'We hit a problem generating your curriculum.',
  persist_failed: 'We hit a snag saving your learning path.',
  draft_missing: 'Your in-progress interview is no longer available.',
  unknown: 'Something went wrong setting up your learning path.',
};

/**
 * Shown when a draft has `status: 'failed'`. Presents the failure reason and
 * offers a retry action that re-queues the Inngest persist job, or a graceful
 * escape back to home.
 */
export function InterviewFailedPanel({
  subjectId,
  bookId,
  failureCode,
}: Props) {
  const router = useRouter();
  const retry = useRetryInterviewPersist();
  const [retryError, setRetryError] = useState<string | null>(null);

  const message = COPY[failureCode ?? 'unknown'] ?? COPY['unknown'];

  return (
    <View
      testID="interview-failed-panel"
      className="flex-1 items-center justify-center p-6"
    >
      <Text className="text-body text-center text-text-primary mb-4">
        {message}
      </Text>
      {retryError ? (
        <Text className="text-body-sm text-danger text-center mb-3">
          {retryError}
        </Text>
      ) : null}
      <Pressable
        testID="interview-retry-button"
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={async () => {
          setRetryError(null);
          try {
            await retry.mutateAsync({ subjectId, bookId });
          } catch {
            setRetryError("Couldn't retry — please try again in a moment.");
          }
        }}
        disabled={retry.isPending}
        className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center w-full mb-3"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {retry.isPending ? 'Retrying…' : 'Try Again'}
        </Text>
      </Pressable>
      <Pressable
        testID="interview-go-home-button"
        accessibilityRole="button"
        accessibilityLabel="Go to home"
        onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
        className="py-2 items-center"
      >
        <Text className="text-body-sm text-primary font-medium">
          Go to home
        </Text>
      </Pressable>
    </View>
  );
}
