import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator
          size="large"
          color="#71717a"
          testID="index-loading"
        />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(learner)/home" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
