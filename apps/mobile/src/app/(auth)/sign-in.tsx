import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const { startSSOFlow: startGoogleSSO } = useSSO();
  const { startSSOFlow: startAppleSSO } = useSSO();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const canSubmit = emailAddress.trim() !== '' && password !== '' && !loading;

  const onSSOPress = useCallback(
    async (strategy: 'oauth_google' | 'oauth_apple') => {
      setError('');
      setOauthLoading(strategy);

      try {
        const startSSO =
          strategy === 'oauth_google' ? startGoogleSSO : startAppleSSO;

        const { createdSessionId } = await startSSO({
          strategy,
          redirectUrl: Linking.createURL('/sso-callback', {
            scheme: 'eduagent',
          }),
        });

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
          // Two-step redirect: always land in (learner), then layout guard
          // checks persona and bounces parent users to /(parent)/dashboard.
          router.replace('/(learner)/home');
        }
      } catch (err: unknown) {
        setError(extractClerkError(err));
      } finally {
        setOauthLoading(null);
      }
    },
    [startGoogleSSO, startAppleSSO, setActive, router]
  );

  const onSignInPress = useCallback(async () => {
    if (!isLoaded || !canSubmit) return;

    setError('');
    setLoading(true);

    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        // Two-step redirect: always land in (learner), then layout guard
        // checks persona and bounces parent users to /(parent)/dashboard.
        router.replace('/(learner)/home');
      } else {
        setError('Sign-in could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, canSubmit, signIn, setActive, router, emailAddress, password]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-h1 font-bold text-text-primary mb-2">
          Welcome back
        </Text>
        <Text className="text-body text-text-secondary mb-8">
          Sign in to continue learning
        </Text>

        {error !== '' && (
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
            <Text className="text-danger text-body-sm">{error}</Text>
          </View>
        )}

        <Pressable
          onPress={() => onSSOPress('oauth_google')}
          disabled={oauthLoading !== null}
          className="bg-surface rounded-button py-3.5 items-center mb-3 flex-row justify-center"
          testID="google-sso-button"
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
        >
          {oauthLoading === 'oauth_google' ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-body font-semibold text-text-primary">
              Continue with Google
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => onSSOPress('oauth_apple')}
          disabled={oauthLoading !== null}
          className="bg-surface rounded-button py-3.5 items-center mb-6 flex-row justify-center"
          testID="apple-sso-button"
          accessibilityRole="button"
          accessibilityLabel="Sign in with Apple"
        >
          {oauthLoading === 'oauth_apple' ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-body font-semibold text-text-primary">
              Continue with Apple
            </Text>
          )}
        </Pressable>

        <View className="flex-row items-center mb-6">
          <View className="flex-1 h-px bg-border" />
          <Text className="text-body-sm text-text-secondary mx-4">or</Text>
          <View className="flex-1 h-px bg-border" />
        </View>

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          Email
        </Text>
        <TextInput
          className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          value={emailAddress}
          onChangeText={setEmailAddress}
          editable={!loading}
          testID="sign-in-email"
        />

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          Password
        </Text>
        <View className="mb-2">
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            editable={!loading}
            testID="sign-in-password"
            onSubmitEditing={onSignInPress}
          />
        </View>

        <View className="items-end mb-4">
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable
              className="min-h-[44px] justify-center"
              testID="forgot-password-link"
            >
              <Text className="text-body-sm text-primary font-semibold">
                Forgot password?
              </Text>
            </Pressable>
          </Link>
        </View>

        <Pressable
          onPress={onSignInPress}
          disabled={!canSubmit}
          className={`rounded-button py-3.5 items-center ${
            canSubmit ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="sign-in-button"
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text
              className={`text-body font-semibold ${
                canSubmit ? 'text-text-inverse' : 'text-text-secondary'
              }`}
            >
              Sign in
            </Text>
          )}
        </Pressable>

        <View className="flex-row justify-center mt-6">
          <Text className="text-body-sm text-text-secondary">
            Don&apos;t have an account?{' '}
          </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable className="min-h-[44px] justify-center">
              <Text className="text-body-sm text-primary font-semibold">
                Sign up
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
