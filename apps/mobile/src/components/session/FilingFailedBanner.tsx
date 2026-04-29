import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ConflictError, RateLimitedError } from '@eduagent/schemas';
import { Sentry } from '../../lib/sentry';
import { useRetryFiling } from '../../hooks/use-retry-filing';

const MAX_RETRIES = 3;
const SUCCESS_DISMISS_MS = 3_000;

interface SessionLike {
  id: string;
  filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null;
  filingRetryCount: number;
}

export function FilingFailedBanner({ session }: { session: SessionLike }) {
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const retry = useRetryFiling();

  useEffect(() => {
    if (session.filingStatus !== 'filing_recovered' && hidden) {
      setHidden(false);
    }
    if (session.filingStatus !== 'filing_failed') {
      setMessage(null);
    }
  }, [session.filingStatus, hidden]);

  useEffect(() => {
    if (session.filingStatus !== 'filing_recovered' || hidden) {
      return;
    }

    const timer = setTimeout(() => setHidden(true), SUCCESS_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [session.filingStatus, hidden]);

  if (session.filingStatus == null || hidden) {
    return null;
  }

  const retryDisabled =
    session.filingRetryCount >= MAX_RETRIES || retry.isPending;

  const onRetry = async () => {
    setMessage(null);
    try {
      await retry.mutateAsync({ sessionId: session.id });
    } catch (err) {
      if (err instanceof ConflictError) {
        setMessage('Retry already in progress.');
      } else if (err instanceof RateLimitedError) {
        setMessage('Retry limit reached for this session.');
      } else {
        setMessage('Could not start retry. Please try again in a moment.');
        Sentry.captureException(err);
      }
    }
  };

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="bg-warning/10 border border-warning/30 rounded-card p-4 mb-4"
      testID="filing-failed-banner"
    >
      {session.filingStatus === 'filing_pending' ? (
        <View className="flex-row items-center">
          <ActivityIndicator />
          <Text className="text-body text-text-primary ms-3">
            Retrying topic placement...
          </Text>
        </View>
      ) : null}

      {session.filingStatus === 'filing_failed' ? (
        <View>
          <Text className="text-body font-semibold text-text-primary">
            Topic placement needs attention
          </Text>
          <Text className="text-body text-text-secondary mt-1">
            Your overall progress is saved. We just need to sort this session
            into the right topic.
          </Text>
          {message ? (
            <Text className="text-caption text-danger mt-2">{message}</Text>
          ) : null}
          <Pressable
            onPress={() => {
              void onRetry();
            }}
            disabled={retryDisabled}
            accessibilityRole="button"
            accessibilityLabel="Retry topic placement for this session"
            accessibilityState={{ disabled: retryDisabled }}
            accessibilityHint={
              session.filingRetryCount >= MAX_RETRIES
                ? 'Retry limit reached for this session.'
                : undefined
            }
            className={`rounded-button py-3 px-4 items-center mt-3 ${
              retryDisabled ? 'bg-surface-elevated' : 'bg-primary'
            }`}
            testID="filing-retry-button"
          >
            <Text
              className={`text-body font-semibold ${
                retryDisabled ? 'text-text-secondary' : 'text-text-inverse'
              }`}
            >
              {retry.isPending ? 'Retrying...' : 'Try again'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {session.filingStatus === 'filing_recovered' ? (
        <Text className="text-body text-text-primary">
          Topic placement recovered.
        </Text>
      ) : null}
    </View>
  );
}
