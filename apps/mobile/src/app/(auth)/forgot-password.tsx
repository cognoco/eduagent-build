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
import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';

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
            <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
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
            />
          </View>

          <Pressable
            onPress={onResetPress}
            disabled={!canSubmitReset}
            className={`rounded-button py-3.5 items-center ${
              canSubmitReset ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            testID="reset-password-button"
          >
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text
                className={`text-body font-semibold ${
                  canSubmitReset ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                Reset password
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
          Forgot password?
        </Text>
        <Text className="text-body text-text-secondary mb-8">
          We&apos;ll send a reset code to your email
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

        <Pressable
          onPress={onSendCodePress}
          disabled={!canSubmitEmail}
          className={`rounded-button py-3.5 items-center ${
            canSubmitEmail ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="send-reset-code-button"
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text
              className={`text-body font-semibold ${
                canSubmitEmail ? 'text-text-inverse' : 'text-text-secondary'
              }`}
            >
              Send reset code
            </Text>
          )}
        </Pressable>

        <View className="flex-row justify-center mt-6">
          <Pressable
            onPress={() => router.back()}
            className="min-h-[44px] justify-center"
            testID="back-to-sign-in"
          >
            <Text className="text-body-sm text-primary font-semibold">
              Back to sign in
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
