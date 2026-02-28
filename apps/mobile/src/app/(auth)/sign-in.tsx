import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';
import { Button } from '../../components/common/Button';

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
          <View
            className="bg-danger/10 rounded-card px-4 py-3 mb-4"
            accessibilityRole="alert"
          >
            <Text className="text-danger text-body-sm">{error}</Text>
          </View>
        )}

        <View className="mb-3">
          <Button
            variant="secondary"
            label="Continue with Google"
            onPress={() => onSSOPress('oauth_google')}
            disabled={oauthLoading !== null}
            loading={oauthLoading === 'oauth_google'}
            testID="google-sso-button"
          />
        </View>

        <View className="mb-6">
          <Button
            variant="secondary"
            label="Continue with Apple"
            onPress={() => onSSOPress('oauth_apple')}
            disabled={oauthLoading !== null}
            loading={oauthLoading === 'oauth_apple'}
            testID="apple-sso-button"
          />
        </View>

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
          <Button
            variant="tertiary"
            size="small"
            label="Forgot password?"
            onPress={() => router.push('/(auth)/forgot-password')}
            testID="forgot-password-link"
          />
        </View>

        <Button
          variant="primary"
          label="Sign in"
          onPress={onSignInPress}
          disabled={!canSubmit}
          loading={loading}
          testID="sign-in-button"
        />

        <View className="flex-row justify-center items-center mt-6">
          <Text className="text-body-sm text-text-secondary">
            Don&apos;t have an account?{' '}
          </Text>
          <Button
            variant="tertiary"
            size="small"
            label="Sign up"
            onPress={() => router.push('/(auth)/sign-up')}
            testID="sign-up-link"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
