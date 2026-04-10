import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ErrorFallback } from './ErrorFallback';

interface LoadingFallbackProps {
  /** Milliseconds before showing the "taking too long" state. Default 15000. */
  timeoutMs?: number;
  /** Called when user taps "Go back" after timeout. */
  onCancel?: () => void;
  /** Called when user taps retry after timeout. */
  onRetry?: () => void;
  testID?: string;
}

export function LoadingFallback({
  timeoutMs = 15_000,
  onCancel,
  onRetry,
  testID,
}: LoadingFallbackProps): React.ReactElement {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  if (timedOut) {
    return (
      <ErrorFallback
        title="This is taking longer than expected"
        message="The server might be busy. You can try again or go back."
        primaryAction={
          onRetry ? { label: 'Try again', onPress: onRetry } : undefined
        }
        secondaryAction={
          onCancel ? { label: 'Go back', onPress: onCancel } : undefined
        }
        testID={testID ? `${testID}-timeout` : undefined}
      />
    );
  }

  return (
    <View className="items-center justify-center py-12" testID={testID}>
      <ActivityIndicator size="large" />
    </View>
  );
}
