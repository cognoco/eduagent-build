import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useThemeColors } from '../lib/theme';
import { ErrorFallback } from '../components/common';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useThemeColors();

  // [M1] Timeout escape for Clerk auth loading spinner
  const [showTimeout, setShowTimeout] = useState(false);
  useEffect(() => {
    if (isLoaded) {
      setShowTimeout(false);
      return;
    }
    const t = setTimeout(() => setShowTimeout(true), 15_000);
    return () => clearTimeout(t);
  }, [isLoaded]);

  if (!isLoaded) {
    if (showTimeout) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title="Taking longer than expected"
            message="Check your connection and try again."
            primaryAction={{
              label: 'Retry',
              onPress: () => setShowTimeout(false),
              testID: 'index-timeout-retry',
            }}
          />
        </View>
      );
    }
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator
          size="large"
          color={colors.muted}
          testID="index-loading"
        />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(app)/home" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
