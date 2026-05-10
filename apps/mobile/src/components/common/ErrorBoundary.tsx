import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
  error,
  componentStack,
  onRetry,
  onGoHome,
}: {
  error: Error | null;
  componentStack: string | null;
  onRetry: () => void;
  onGoHome: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const debugBody = error
    ? `${error.name ?? 'Error'}: ${error.message ?? '(no message)'}\n\n` +
      `STACK:\n${error.stack ?? '(no stack)'}\n\n` +
      `COMPONENT STACK:${componentStack ?? '\n(no component stack)'}`
    : '(no error captured)';

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ flexGrow: 1, padding: 16 }}
      testID="error-boundary-scroll"
    >
      <ErrorFallback
        variant="centered"
        title={t('errorBoundary.title')}
        message={t('errorBoundary.message')}
        primaryAction={{
          label: t('recovery.tryAgain'),
          onPress: onRetry,
          testID: 'error-boundary-retry',
        }}
        secondaryAction={{
          label: t('recovery.goHome'),
          onPress: () => {
            // Reset the boundary BEFORE navigating — otherwise hasError stays
            // true and the fallback renders over whatever Home resolves to,
            // making the button appear to do nothing.
            onGoHome();
            router.replace('/(app)/home' as never);
          },
          testID: 'error-boundary-go-home',
        }}
        testID="error-boundary-fallback"
      />
      {__DEV__ ? (
        <View
          className="mt-6 mx-4 rounded-card border border-border bg-surface p-4"
          testID="error-boundary-debug"
        >
          <Text className="text-caption font-bold uppercase text-text-secondary mb-2">
            Debug details (screenshot this)
          </Text>
          <Text
            selectable
            className="text-body-sm text-text-primary"
            style={{ fontFamily: 'monospace' }}
          >
            {debugBody}
          </Text>
        </View>
      ) : (
        <Text
          className="mt-6 mx-4 text-caption text-text-secondary text-center"
          testID="error-boundary-logged"
        >
          {t('errorBoundary.logged')}
        </Text>
      )}
    </ScrollView>
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
      errorInfo.componentStack,
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
      return (
        <ErrorFallbackView
          error={this.state.error}
          componentStack={this.state.componentStack}
          onRetry={this.handleRetry}
          onGoHome={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}
