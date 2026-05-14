import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from './ErrorFallback';
import { TimeoutLoader } from './TimeoutLoader';

interface QueryStateAction {
  /** Falls back to t('common.retry') / t('common.goBack') when omitted. */
  label?: string;
  onPress: () => void;
  testID?: string;
}

interface QueryStateViewProps {
  isLoading: boolean;
  /** Any truthy value renders the error fallback (takes precedence over isLoading). */
  error?: unknown;
  /** Primary action — required so error/timeout states are never dead-ends. */
  retry: QueryStateAction;
  /** Optional secondary action (e.g. router.back / router.replace home). */
  back?: QueryStateAction;
  loadingTitle?: string;
  loadingMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
  /** ms before the loading spinner falls back to error UI. Default 15000. */
  timeoutMs?: number;
  /** Visual variant forwarded to ErrorFallback / TimeoutLoader. Default 'centered'. */
  variant?: 'centered' | 'card';
  testID?: string;
  children: ReactNode;
}

/**
 * Standard query-state wrapper: loading spinner → optional timeout → error
 * fallback → success children. Composes the existing TimeoutLoader and
 * ErrorFallback so screens don't reimplement the pattern ad-hoc.
 *
 * Per CLAUDE.md → "UX Resilience Rules": every error/timeout state must be
 * actionable, so `retry` is required.
 */
export function QueryStateView({
  isLoading,
  error,
  retry,
  back,
  loadingTitle,
  loadingMessage,
  errorTitle,
  errorMessage,
  timeoutMs,
  variant = 'centered',
  testID,
  children,
}: QueryStateViewProps): ReactNode {
  const { t } = useTranslation();

  const primaryAction = {
    label: retry.label ?? t('common.retry'),
    onPress: retry.onPress,
    testID: retry.testID,
  };
  const secondaryAction = back
    ? {
        label: back.label ?? t('common.goBack'),
        onPress: back.onPress,
        testID: back.testID,
      }
    : undefined;

  if (error) {
    return (
      <ErrorFallback
        variant={variant}
        title={errorTitle}
        message={errorMessage}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        testID={testID}
      />
    );
  }

  if (isLoading) {
    return (
      <TimeoutLoader
        isLoading
        timeoutMs={timeoutMs}
        title={loadingTitle}
        message={loadingMessage}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        variant={variant}
        testID={testID}
      />
    );
  }

  return children;
}
