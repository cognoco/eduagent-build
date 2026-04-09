import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useThemeColors } from '../lib/theme';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useThemeColors();

  if (!isLoaded) {
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
