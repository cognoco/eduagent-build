import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, View, Text, Pressable } from 'react-native';
import { Sentry } from '../../lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
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
      return (
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="items-center justify-center px-8 py-12"
          accessibilityRole="alert"
        >
          <Text className="text-h2 font-bold text-text-primary mb-2">
            Something went wrong
          </Text>
          <Text className="text-body text-text-secondary text-center mb-4">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          {__DEV__ && this.state.componentStack && (
            <View className="bg-surface rounded-card px-3 py-2 mb-4 w-full">
              <Text className="text-caption text-text-tertiary font-mono">
                {this.state.componentStack.trim().slice(0, 500)}
              </Text>
            </View>
          )}
          <Pressable
            onPress={this.handleRetry}
            className="bg-primary rounded-button px-6 py-3"
            accessibilityLabel="Try again"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Try Again
            </Text>
          </Pressable>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}
