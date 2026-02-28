import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignUp, useSSO } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';
import { Button } from '../../components/common/Button';

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
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

  const canSubmitSignUp =
    emailAddress.trim() !== '' && password.length >= 8 && !loading;
  const canSubmitCode = code.trim() !== '' && !loading;

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

  const onSignUpPress = useCallback(async () => {
    if (!isLoaded || !canSubmitSignUp) return;

    setError('');
    setLoading(true);

    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, canSubmitSignUp, signUp, emailAddress, password]);

  const onVerifyPress = useCallback(async () => {
    if (!isLoaded || !canSubmitCode) return;

    setError('');
    setLoading(true);

    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (signUpAttempt.status === 'complete') {
        await setActive({ session: signUpAttempt.createdSessionId });
        // Two-step redirect: always land in (learner), then layout guard
        // checks persona and bounces parent users to /(parent)/dashboard.
        router.replace('/(learner)/home');
      } else {
        setError('Verification could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      setError(
        extractClerkError(err, 'Invalid verification code. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }, [isLoaded, canSubmitCode, signUp, setActive, router, code]);

  const onResendCode = useCallback(async () => {
    if (!isLoaded || resending) return;

    setError('');
    setResending(true);

    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setResending(false);
    }
  }, [isLoaded, resending, signUp]);

  const onBackFromVerification = useCallback(() => {
    setPendingVerification(false);
    setCode('');
    setError('');
  }, []);

  if (pendingVerification) {
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
            Verify your email
          </Text>
          <Text className="text-body text-text-secondary mb-8">
            We sent a verification code to {emailAddress}
          </Text>

          {error !== '' && (
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-4"
              accessibilityRole="alert"
            >
              <Text className="text-danger text-body-sm">{error}</Text>
            </View>
          )}

          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            Verification code
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
            placeholder="Enter 6-digit code"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            editable={!loading}
            testID="sign-up-code"
          />

          <Button
            variant="primary"
            label="Verify"
            onPress={onVerifyPress}
            disabled={!canSubmitCode}
            loading={loading}
            testID="sign-up-verify-button"
          />

          <View className="flex-row justify-center mt-4">
            <Button
              variant="tertiary"
              size="small"
              label="Resend code"
              onPress={onResendCode}
              loading={resending}
              testID="sign-up-resend-code"
            />
          </View>

          <View className="flex-row justify-center mt-2">
            <Button
              variant="tertiary"
              size="small"
              label="Use a different email"
              onPress={onBackFromVerification}
              testID="sign-up-back-from-verify"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
          Create account
        </Text>
        <Text className="text-body text-text-secondary mb-8">
          Start your learning journey
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
            testID="sign-up-google-sso"
          />
        </View>

        {Platform.OS !== 'web' && (
          <View className="mb-6">
            <Button
              variant="secondary"
              label="Continue with Apple"
              onPress={() => onSSOPress('oauth_apple')}
              disabled={oauthLoading !== null}
              loading={oauthLoading === 'oauth_apple'}
              testID="sign-up-apple-sso"
            />
          </View>
        )}

        <View className="flex-row items-center mb-6">
          <View className="flex-1 h-px bg-border" />
          <Text className="text-body-sm text-text-secondary mx-4">
            or continue with email
          </Text>
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
          testID="sign-up-email"
        />

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          Password
        </Text>
        <View className="mb-6">
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder="Create a password"
            editable={!loading}
            testID="sign-up-password"
            showRequirements
            onSubmitEditing={onSignUpPress}
          />
        </View>

        <Button
          variant="primary"
          label="Sign up"
          onPress={onSignUpPress}
          disabled={!canSubmitSignUp}
          loading={loading}
          testID="sign-up-button"
        />

        <View className="flex-row justify-center items-center mt-6">
          <Text className="text-body-sm text-text-secondary">
            Already have an account?{' '}
          </Text>
          <Button
            variant="tertiary"
            size="small"
            label="Sign in"
            onPress={() => router.push('/(auth)/sign-in')}
            testID="sign-in-link"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
