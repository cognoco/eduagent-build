import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { PersistFailureCode } from '@eduagent/schemas';
import { useRetryInterviewPersist } from '../../hooks/use-interview';
import { goBackOrReplace } from '../../lib/navigation';

interface Props {
  subjectId: string;
  bookId?: string;
  failureCode: PersistFailureCode | null;
}

const COPY_KEYS: Record<string, string> = {
  extract_signals_failed: 'interview.failed.extractSignalsFailed',
  empty_signals: 'interview.failed.emptySignals',
  generate_curriculum_failed: 'interview.failed.generateCurriculumFailed',
  persist_failed: 'interview.failed.persistFailed',
  draft_missing: 'interview.failed.draftMissing',
  unknown: 'interview.failed.unknown',
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
  const { t } = useTranslation();
  const router = useRouter();
  const retry = useRetryInterviewPersist();
  const [retryError, setRetryError] = useState<string | null>(null);

  const messageKey =
    COPY_KEYS[failureCode ?? 'unknown'] ??
    COPY_KEYS['unknown'] ??
    'interview.failed.unknown';
  const message = t(messageKey);

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
        accessibilityLabel={t('interview.failed.tryAgain')}
        onPress={async () => {
          setRetryError(null);
          try {
            await retry.mutateAsync({ subjectId, bookId });
          } catch {
            setRetryError(t('interview.failed.retryError'));
          }
        }}
        disabled={retry.isPending}
        className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center w-full mb-3"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {retry.isPending
            ? t('interview.failed.retrying')
            : t('interview.failed.tryAgain')}
        </Text>
      </Pressable>
      <Pressable
        testID="interview-go-home-button"
        accessibilityRole="button"
        accessibilityLabel={t('common.goHome')}
        onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
        className="py-2 items-center"
      >
        <Text className="text-body-sm text-primary font-medium">
          {t('common.goHome')}
        </Text>
      </Pressable>
    </View>
  );
}
