import { Component, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View
          className="flex-1 bg-background items-center justify-center px-8"
          accessibilityRole="alert"
        >
          <Text className="text-h2 font-bold text-text-primary mb-2">
            Something went wrong
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
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
        </View>
      );
    }

    return this.props.children;
  }
}
