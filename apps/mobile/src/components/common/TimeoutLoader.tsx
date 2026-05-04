import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from './ErrorFallback';

interface TimeoutLoaderAction {
  label: string;
  onPress: () => void;
  testID?: string;
}

interface TimeoutLoaderProps {
  /** Whether the loading state is active. When false the component renders nothing. */
  isLoading: boolean;
  /** Milliseconds before showing the timeout fallback. Default 15000. */
  timeoutMs?: number;
  /** Title shown in the ErrorFallback after timeout. */
  title?: string;
  /** Message shown in the ErrorFallback after timeout. */
  message?: string;
  /** Primary action for the ErrorFallback (e.g. Retry). */
  primaryAction: TimeoutLoaderAction;
  /** Optional secondary action for the ErrorFallback (e.g. Go Back). */
  secondaryAction?: TimeoutLoaderAction;
  /** testID forwarded to the spinner View. */
  testID?: string;
}

/**
 * Wraps a loading spinner with a configurable escape hatch.
 * After timeoutMs expires, renders ErrorFallback variant="centered" so
 * the user always has at least one action available.
 */
export function TimeoutLoader({
  isLoading,
  timeoutMs = 15_000,
  title,
  message,
  primaryAction,
  secondaryAction,
  testID,
}: TimeoutLoaderProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('common.timeoutLoader.title');
  const resolvedMessage = message ?? t('common.timeoutLoader.message');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [isLoading, timeoutMs]);

  if (!isLoading) return null;

  if (timedOut) {
    return (
      <ErrorFallback
        variant="centered"
        title={resolvedTitle}
        message={resolvedMessage}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
      />
    );
  }

  return (
    <View
      className="flex-1 bg-background items-center justify-center"
      testID={testID}
    >
      <ActivityIndicator size="large" />
    </View>
  );
}
