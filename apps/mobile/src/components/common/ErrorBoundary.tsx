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
      // Use inline styles — NOT NativeWind classes. This boundary may render
      // outside ThemeContext (e.g. it wraps ThemedApp), so CSS custom
      // properties like --color-text-primary won't exist. Hardcoded colors
      // guarantee the error message is always readable.
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: '#faf5ef' }}
          contentContainerStyle={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
            paddingVertical: 48,
          }}
          accessibilityRole="alert"
        >
          <Text
            style={{
              fontSize: 22,
              fontWeight: 'bold',
              color: '#1a1a1a',
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: '#555',
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          {this.state.componentStack && (
            <View
              style={{
                backgroundColor: '#eee',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 16,
                width: '100%',
              }}
            >
              <Text
                style={{ fontSize: 11, color: '#333', fontFamily: 'monospace' }}
                selectable
              >
                {this.state.componentStack.trim().slice(0, 800)}
              </Text>
            </View>
          )}
          <Pressable
            onPress={this.handleRetry}
            style={{
              backgroundColor: '#0d9488',
              borderRadius: 12,
              paddingHorizontal: 24,
              paddingVertical: 14,
            }}
            accessibilityLabel="Try again"
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              Try Again
            </Text>
          </Pressable>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}
