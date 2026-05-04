import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../lib/theme';
import { ErrorFallback } from '../components/common';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useThemeColors();
  const { t } = useTranslation();

  // [M1] Timeout escape for Clerk auth loading spinner
  const [showTimeout, setShowTimeout] = useState(false);
  useEffect(() => {
    if (isLoaded) {
      setShowTimeout(false);
      return;
    }
    const timer = setTimeout(() => setShowTimeout(true), 15_000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  if (!isLoaded) {
    if (showTimeout) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title={t('auth.index.timeoutTitle')}
            message={t('auth.index.timeoutMessage')}
            primaryAction={{
              label: t('common.retry'),
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
