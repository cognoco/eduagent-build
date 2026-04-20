import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useThemeColors, useTokenVars } from '../../lib/theme';

export default function AuthRoutesLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { redirectTo } = useLocalSearchParams<{
    redirectTo?: string | string[];
  }>();
  const tokenVars = useTokenVars();
  const colors = useThemeColors();
  const nextRoute =
    (Array.isArray(redirectTo) ? redirectTo[0] : redirectTo) ?? '/(app)/home';
  const safeNextRoute =
    typeof nextRoute === 'string' && nextRoute.startsWith('/')
      ? nextRoute
      : '/(app)/home';

  if (!isLoaded) return null;
  if (__DEV__)
    console.log(`[AUTH-DEBUG] (auth) layout | isSignedIn=${isSignedIn}`);
  if (isSignedIn) {
    if (__DEV__)
      console.log(
        `[AUTH-DEBUG] (auth) layout → redirecting to ${safeNextRoute}`
      );
    return <Redirect href={safeNextRoute} />;
  }

  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </View>
  );
}
