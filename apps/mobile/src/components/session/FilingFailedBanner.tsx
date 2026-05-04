import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CONFLICT_ERROR_NAME,
  RATE_LIMITED_ERROR_NAME,
} from '@eduagent/schemas';
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
  const { t } = useTranslation();
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
      if (err instanceof Error && err.name === CONFLICT_ERROR_NAME) {
        setMessage(t('session.filingFailed.retryInProgress'));
      } else if (err instanceof Error && err.name === RATE_LIMITED_ERROR_NAME) {
        setMessage(t('session.filingFailed.retryLimitReached'));
      } else {
        setMessage(t('session.filingFailed.couldNotStartRetry'));
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
            {t('session.filingFailed.retrying')}
          </Text>
        </View>
      ) : null}

      {session.filingStatus === 'filing_failed' ? (
        <View>
          <Text className="text-body font-semibold text-text-primary">
            {t('session.filingFailed.needsAttention')}
          </Text>
          <Text className="text-body text-text-secondary mt-1">
            {t('session.filingFailed.progressSaved')}
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
            accessibilityLabel={t('session.filingFailed.retryLabel')}
            accessibilityState={{ disabled: retryDisabled }}
            accessibilityHint={
              session.filingRetryCount >= MAX_RETRIES
                ? t('session.filingFailed.retryLimitReached')
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
              {retry.isPending
                ? t('session.filingFailed.retryingButton')
                : t('session.filingFailed.tryAgain')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {session.filingStatus === 'filing_recovered' ? (
        <Text className="text-body text-text-primary">
          {t('session.filingFailed.recovered')}
        </Text>
      ) : null}
    </View>
  );
}
