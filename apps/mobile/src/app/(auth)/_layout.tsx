import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTokenVars } from '../../lib/theme';

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();
  const tokenVars = useTokenVars();

  if (__DEV__)
    console.log(`[AUTH-DEBUG] (auth) layout | isSignedIn=${isSignedIn}`);
  if (isSignedIn) {
    if (__DEV__)
      console.log('[AUTH-DEBUG] (auth) layout → redirecting to /(app)/home');
    return <Redirect href="/(app)/home" />;
  }

  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
