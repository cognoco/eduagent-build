import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { ErrorFallback } from './ErrorFallback';
import { Sentry } from '../../lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

/**
 * Functional inner component so we can use `useRouter` inside a class boundary.
 * The boundary itself must be a class (React constraint), but the error UI is
 * rendered by this function component and has full hook access.
 *
 * NOTE: This boundary wraps ThemedApp (see _layout.tsx), so ThemeContext and
 * CSS custom properties are NOT available here. ErrorFallback uses NativeWind
 * classes that reference CSS variables — they will fall back to their default
 * values, which is acceptable for this rarely-seen crash screen.
 */
function ErrorFallbackView({
  onRetry,
}: {
  onRetry: () => void;
}): React.ReactElement {
  const router = useRouter();
  return (
    <ErrorFallback
      variant="centered"
      title="Something went wrong"
      message="An unexpected error occurred. You can try again or go back to the home screen."
      primaryAction={{
        label: 'Try Again',
        onPress: onRetry,
        testID: 'error-boundary-retry',
      }}
      secondaryAction={{
        label: 'Go Home',
        onPress: () => router.replace('/(app)/home' as never),
        testID: 'error-boundary-go-home',
      }}
      testID="error-boundary-fallback"
    />
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      '[ErrorBoundary] Caught error:',
      error.message,
      '\nStack:',
      error.stack,
      '\nComponent stack:',
      errorInfo.componentStack
    );
    this.setState({ componentStack: errorInfo.componentStack ?? null });
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorFallbackView onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}
