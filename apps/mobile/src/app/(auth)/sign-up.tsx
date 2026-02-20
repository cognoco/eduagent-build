import { useState, useCallback } from 'react';
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
import { useSignUp } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';

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

  const canSubmitSignUp =
    emailAddress.trim() !== '' && password.length >= 8 && !loading;
  const canSubmitCode = code.trim() !== '' && !loading;

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
            <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
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

          <Pressable
            onPress={onVerifyPress}
            disabled={!canSubmitCode}
            className={`rounded-button py-3.5 items-center ${
              canSubmitCode ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            testID="sign-up-verify-button"
          >
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text
                className={`text-body font-semibold ${
                  canSubmitCode ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                Verify
              </Text>
            )}
          </Pressable>
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
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
            <Text className="text-danger text-body-sm">{error}</Text>
          </View>
        )}

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

        <Pressable
          onPress={onSignUpPress}
          disabled={!canSubmitSignUp}
          className={`rounded-button py-3.5 items-center ${
            canSubmitSignUp ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="sign-up-button"
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text
              className={`text-body font-semibold ${
                canSubmitSignUp ? 'text-text-inverse' : 'text-text-secondary'
              }`}
            >
              Sign up
            </Text>
          )}
        </Pressable>

        <View className="flex-row justify-center mt-6">
          <Text className="text-body-sm text-text-secondary">
            Already have an account?{' '}
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable className="min-h-[44px] justify-center">
              <Text className="text-body-sm text-primary font-semibold">
                Sign in
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
