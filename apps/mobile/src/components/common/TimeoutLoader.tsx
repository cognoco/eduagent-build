import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from './ErrorFallback';
import { useAnnounce } from '../../hooks/use-announce';

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
  /** Optional primary action for the ErrorFallback (e.g. Retry). */
  primaryAction?: TimeoutLoaderAction;
  /** Optional secondary action for the ErrorFallback (e.g. Go Back). */
  secondaryAction?: TimeoutLoaderAction;
  /** Optional label shown next to the spinner before timeout. */
  loadingLabel?: string;
  /** Optional supporting text shown before timeout. */
  loadingDescription?: string;
  /** Optional custom loading UI rendered before timeout. */
  loadingFallback?: ReactNode;
  /** Visual variant for both the pre-timeout loader and timeout fallback. */
  variant?: 'card' | 'centered';
  /** testID forwarded to the spinner View. */
  testID?: string;
  /** Optional testID used only after the timeout fallback replaces the spinner. */
  fallbackTestID?: string;
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
  loadingLabel,
  loadingDescription,
  loadingFallback,
  variant = 'centered',
  testID,
  fallbackTestID,
}: TimeoutLoaderProps) {
  const { t } = useTranslation();
  const announce = useAnnounce();
  const resolvedTitle = title ?? t('common.timeoutLoader.title');
  const resolvedMessage = message ?? t('common.timeoutLoader.message');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  // Announce loading state to screen-reader users when spinner mounts (F-053).
  useEffect(() => {
    if (isLoading && !timedOut) {
      announce(loadingLabel ?? t('common.timeoutLoader.loading'));
    }
  }, [isLoading, timedOut, loadingLabel, announce, t]);

  if (!isLoading) return null;

  if (timedOut) {
    return (
      <ErrorFallback
        title={resolvedTitle}
        message={resolvedMessage}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        variant={variant}
        testID={fallbackTestID ?? testID}
      />
    );
  }

  if (loadingFallback) {
    return <>{loadingFallback}</>;
  }

  return (
    <View
      className={
        variant === 'card'
          ? 'bg-coaching-card rounded-card p-5'
          : 'flex-1 bg-background items-center justify-center px-6'
      }
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={loadingLabel ?? t('common.timeoutLoader.loading')}
    >
      <ActivityIndicator size="large" />
      {loadingLabel ? (
        <Text className="text-h3 font-semibold text-text-primary text-center mt-4">
          {loadingLabel}
        </Text>
      ) : null}
      {loadingDescription ? (
        <Text className="text-body-sm text-text-secondary text-center mt-2">
          {loadingDescription}
        </Text>
      ) : null}
    </View>
  );
}
