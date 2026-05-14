import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router, type Href } from 'expo-router';
import { tokens } from '../../../../lib/design-tokens';
import { Sentry } from '../../../../lib/sentry';

/**
 * Session-specific error boundary with visible diagnostics.
 * Uses hardcoded hex colors intentionally — theme context may not be
 * available during a crash, so inline styles guarantee readable text
 * regardless of whether ThemeProvider is mounted. Do not replace with
 * semantic tokens.
 */
export class SessionErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; componentStack: string | null }
> {
  override state = {
    hasError: false,
    error: null as Error | null,
    componentStack: null as string | null,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack ?? '';
    this.setState({ componentStack: stack });
    console.error(
      '[SessionScreen CRASH]',
      error.message,
      '\n\nError stack:',
      error.stack,
      '\n\nComponent stack:',
      stack,
    );
    Sentry.captureException(error, {
      tags: { screen: 'session', crashLocation: 'SessionErrorBoundary' },
      extra: { componentStack: stack },
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: tokens.light.colors.background }}
          contentContainerStyle={{
            padding: 24,
            paddingTop: 60,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: tokens.light.colors.danger,
              marginBottom: 12,
            }}
          >
            Session screen crashed
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: tokens.light.colors.textPrimary,
              marginBottom: 16,
              fontWeight: '600',
            }}
          >
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
          {__DEV__ && (
            <>
              <Text
                style={{
                  fontSize: 11,
                  color: tokens.light.colors.textSecondary,
                  fontFamily: 'monospace',
                  marginBottom: 16,
                }}
                selectable
              >
                {this.state.error?.stack?.slice(0, 1200) ?? ''}
              </Text>
              {this.state.componentStack && (
                <View
                  style={{
                    backgroundColor: tokens.light.colors.dangerSoft,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: tokens.light.colors.textPrimary,
                      fontFamily: 'monospace',
                    }}
                    selectable
                  >
                    {this.state.componentStack.trim().slice(0, 1000)}
                  </Text>
                </View>
              )}
            </>
          )}
          <Pressable
            onPress={() =>
              this.setState({
                hasError: false,
                error: null,
                componentStack: null,
              })
            }
            style={{
              backgroundColor: tokens.light.colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: tokens.light.colors.textInverse,
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              Try Again
            </Text>
          </Pressable>
          {/* [UX-DE-M3] Secondary escape so a crash-loop doesn't trap the user.
              Hardcoded hex intentional — ThemeProvider may not be available.
              Uses the imperative expo-router `router` (module-level singleton)
              since class components cannot call the useRouter hook. */}
          <Pressable
            onPress={() => {
              this.setState({
                hasError: false,
                error: null,
                componentStack: null,
              });
              router.replace('/(app)/home' as Href);
            }}
            style={{
              backgroundColor: tokens.light.colors.border,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
            testID="session-error-boundary-go-home"
            accessibilityRole="button"
            accessibilityLabel="Go Home"
          >
            <Text
              style={{
                color: tokens.light.colors.textSecondary,
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              Go Home
            </Text>
          </Pressable>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
