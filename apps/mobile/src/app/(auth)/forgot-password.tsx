import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';
import { Button } from '../../components/common/Button';

export default function ForgotPasswordScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [emailAddress, setEmailAddress] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pendingReset, setPendingReset] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const canSubmitEmail = emailAddress.trim() !== '' && !loading;
  const canSubmitReset =
    code.trim() !== '' && newPassword.length >= 8 && !loading;

  const onSendCodePress = useCallback(async () => {
    if (!isLoaded || !canSubmitEmail) return;

    setError('');
    setLoading(true);

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: emailAddress,
      });
      setPendingReset(true);
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, canSubmitEmail, signIn, emailAddress]);

  const onResetPress = useCallback(async () => {
    if (!isLoaded || !canSubmitReset) return;

    setError('');
    setLoading(true);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(learner)/home');
      } else {
        setError('Password reset could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, canSubmitReset, signIn, setActive, router, code, newPassword]);

  const onResendCode = useCallback(async () => {
    if (!isLoaded || resending) return;

    setError('');
    setResending(true);

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: emailAddress,
      });
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setResending(false);
    }
  }, [isLoaded, resending, signIn, emailAddress]);

  const onBackFromReset = useCallback(() => {
    setPendingReset(false);
    setCode('');
    setNewPassword('');
    setError('');
  }, []);

  if (pendingReset) {
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
            Reset password
          </Text>
          <Text className="text-body text-text-secondary mb-8">
            Enter the code sent to {emailAddress} and your new password
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
            Reset code
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-4"
            placeholder="Enter 6-digit code"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            editable={!loading}
            testID="reset-code"
          />

          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            New password
          </Text>
          <View className="mb-6">
            <PasswordInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              editable={!loading}
              testID="reset-new-password"
              showRequirements
              onSubmitEditing={onResetPress}
            />
          </View>

          <Button
            variant="primary"
            label="Reset password"
            onPress={onResetPress}
            disabled={!canSubmitReset}
            loading={loading}
            testID="reset-password-button"
          />

          <View className="flex-row justify-center mt-4">
            <Button
              variant="tertiary"
              size="small"
              label="Resend code"
              onPress={onResendCode}
              loading={resending}
              testID="reset-resend-code"
            />
          </View>

          <View className="flex-row justify-center mt-2">
            <Button
              variant="tertiary"
              size="small"
              label="Use a different email"
              onPress={onBackFromReset}
              testID="reset-back-from-code"
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
          Forgot password?
        </Text>
        <Text className="text-body text-text-secondary mb-8">
          We&apos;ll send a reset code to your email
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
          Email
        </Text>
        <TextInput
          className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          value={emailAddress}
          onChangeText={setEmailAddress}
          editable={!loading}
          testID="forgot-password-email"
        />

        <Button
          variant="primary"
          label="Send reset code"
          onPress={onSendCodePress}
          disabled={!canSubmitEmail}
          loading={loading}
          testID="send-reset-code-button"
        />

        <View className="flex-row justify-center mt-6">
          <Button
            variant="tertiary"
            size="small"
            label="Back to sign in"
            onPress={() => router.back()}
            testID="back-to-sign-in"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
