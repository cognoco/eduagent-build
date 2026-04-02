import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { useWebBrowserWarmup } from '../../hooks/use-web-browser-warmup';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';
import { Button } from '../../components/common/Button';
import { useKeyboardScroll } from '../../hooks/use-keyboard-scroll';
import { MentomateLogo } from '../../components/MentomateLogo';

// Use physical screen height (not window) so the content container always
// overflows the ScrollView after adjustResize shrinks it for the keyboard.
// This makes the ScrollView scrollable, letting users reach covered inputs.
// On web, cap at a mobile-like height to avoid massive whitespace.
const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

const HAS_SIGNED_IN_KEY = 'hasSignedInBefore';

type VerificationStage = 'first_factor' | 'second_factor';

type VerificationState =
  | {
      stage: VerificationStage;
      strategy: 'email_code';
      identifier: string;
      emailAddressId: string;
    }
  | {
      stage: VerificationStage;
      strategy: 'phone_code';
      identifier: string;
      phoneNumberId?: string;
    };

type EmailCodeFactor = {
  strategy: 'email_code';
  emailAddressId: string;
  safeIdentifier?: string;
};

type PhoneCodeFactor = {
  strategy: 'phone_code';
  phoneNumberId?: string;
  safeIdentifier?: string;
};

type SignInAttemptLike = {
  status: string | null;
  createdSessionId: string | null;
  supportedFirstFactors?: unknown[] | null;
  supportedSecondFactors?: unknown[] | null;
};

function isEmailCodeFactor(factor: unknown): factor is EmailCodeFactor {
  return (
    typeof factor === 'object' &&
    factor !== null &&
    'strategy' in factor &&
    factor.strategy === 'email_code' &&
    'emailAddressId' in factor &&
    typeof factor.emailAddressId === 'string'
  );
}

function isPhoneCodeFactor(factor: unknown): factor is PhoneCodeFactor {
  return (
    typeof factor === 'object' &&
    factor !== null &&
    'strategy' in factor &&
    factor.strategy === 'phone_code'
  );
}

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
  const [isReturningUser, setIsReturningUser] = useState<boolean | null>(null);
  const [verificationOffer, setVerificationOffer] =
    useState<VerificationState | null>(null);
  const [pendingVerification, setPendingVerification] =
    useState<VerificationState | null>(null);
  const [code, setCode] = useState('');
  const [resending, setResending] = useState(false);
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();
  const {
    scrollRef: verifyScrollRef,
    onFieldLayout: onVerifyFieldLayout,
    onFieldFocus: onVerifyFieldFocus,
  } = useKeyboardScroll();

  useEffect(() => {
    (async () => {
      try {
        const value = await SecureStore.getItemAsync(HAS_SIGNED_IN_KEY);
        setIsReturningUser(value === 'true');
      } catch {
        setIsReturningUser(false);
      }
    })();
  }, []);

  const { startSSOFlow: startGoogleSSO } = useSSO();
  const { startSSOFlow: startAppleSSO } = useSSO();

  useWebBrowserWarmup();

  const canSubmit = emailAddress.trim() !== '' && password !== '' && !loading;
  const canSubmitCode =
    pendingVerification !== null && code.trim() !== '' && !loading;
  const clearVerificationFlow = useCallback(
    (clearError = false) => {
      setVerificationOffer(null);
      setPendingVerification(null);
      setCode('');
      if (clearError) {
        setError('');
      }
    },
    [setError]
  );

  const onSSOPress = useCallback(
    async (strategy: 'oauth_google' | 'oauth_apple') => {
      clearVerificationFlow();
      setError('');
      setOauthLoading(strategy);

      try {
        const startSSO =
          strategy === 'oauth_google' ? startGoogleSSO : startAppleSSO;

        const { createdSessionId } = await startSSO({
          strategy,
          redirectUrl: Linking.createURL('/sso-callback', {
            scheme: 'mentomate',
          }),
        });

        if (createdSessionId && setActive) {
          try {
            await setActive({ session: createdSessionId });
          } catch {
            setError(
              'Could not activate your session. Please try signing in again.'
            );
            return;
          }
          void SecureStore.setItemAsync(HAS_SIGNED_IN_KEY, 'true');
          // Two-step redirect: always land in (learner), then layout guard
          // checks persona and bounces parent users to /(parent)/dashboard.
          router.replace('/(learner)/home');
          return;
        }

        setError('Sign-in could not be completed. Please try again.');
      } catch (err: unknown) {
        setError(extractClerkError(err));
      } finally {
        setOauthLoading(null);
      }
    },
    [clearVerificationFlow, startGoogleSSO, startAppleSSO, setActive, router]
  );

  const activateSession = useCallback(
    async (sessionId: string | null) => {
      if (!sessionId) {
        setError('No session was created. Please try again.');
        return;
      }
      if (!setActive) {
        setError('Authentication not loaded. Please try again.');
        return;
      }

      try {
        await setActive({ session: sessionId });
      } catch {
        setError(
          'Could not activate your session. Please try signing in again.'
        );
        return;
      }

      setPendingVerification(null);
      setVerificationOffer(null);
      setCode('');
      void SecureStore.setItemAsync(HAS_SIGNED_IN_KEY, 'true');
      router.replace('/(learner)/home');
    },
    [setActive, router]
  );

  const getVerificationStep = useCallback(
    (attempt: SignInAttemptLike) => {
      if (attempt.status === 'needs_first_factor') {
        const emailFactor =
          attempt.supportedFirstFactors?.find(isEmailCodeFactor) ?? null;

        if (emailFactor) {
          return {
            stage: 'first_factor',
            strategy: 'email_code',
            identifier:
              emailFactor.safeIdentifier || emailAddress.trim() || 'your email',
            emailAddressId: emailFactor.emailAddressId,
          } as const;
        }
      }

      if (attempt.status === 'needs_second_factor') {
        const emailFactor =
          attempt.supportedSecondFactors?.find(isEmailCodeFactor) ?? null;
        if (emailFactor) {
          return {
            stage: 'second_factor',
            strategy: 'email_code',
            identifier:
              emailFactor.safeIdentifier || emailAddress.trim() || 'your email',
            emailAddressId: emailFactor.emailAddressId,
          } as const;
        }

        const phoneFactor =
          attempt.supportedSecondFactors?.find(isPhoneCodeFactor) ?? null;
        if (phoneFactor) {
          return {
            stage: 'second_factor',
            strategy: 'phone_code',
            identifier: phoneFactor.safeIdentifier ?? 'your phone',
            phoneNumberId: phoneFactor.phoneNumberId,
          } as const;
        }
      }

      return null;
    },
    [emailAddress]
  );

  const startVerificationFlow = useCallback(
    async (step: VerificationState) => {
      if (!signIn) {
        throw new Error('Authentication not loaded.');
      }

      if (step.stage === 'first_factor' && step.strategy === 'email_code') {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: step.emailAddressId,
        });
      } else if (step.strategy === 'email_code') {
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: step.emailAddressId,
        });
      } else {
        await signIn.prepareSecondFactor({
          strategy: 'phone_code',
          ...(step.phoneNumberId ? { phoneNumberId: step.phoneNumberId } : {}),
        });
      }

      setVerificationOffer(null);
      setPendingVerification(step);
      setCode('');
    },
    [signIn]
  );

  const handleIncompleteSignIn = useCallback(
    async (attempt: SignInAttemptLike) => {
      const nextVerificationStep = getVerificationStep(attempt);
      if (nextVerificationStep) {
        setVerificationOffer(nextVerificationStep);
        setPendingVerification(null);
        setCode('');
        return;
      }

      clearVerificationFlow();

      if (attempt.status === 'needs_new_password') {
        setError(
          'Your password needs to be updated before you can sign in. Use Forgot password? to reset it.'
        );
        return;
      }

      if (
        attempt.status === 'needs_first_factor' ||
        attempt.status === 'needs_second_factor'
      ) {
        setError(
          'This account needs an additional verification method that this build does not support yet. Please use a different sign-in method.'
        );
        return;
      }

      setError('Sign-in could not be completed. Please try again.');
    },
    [clearVerificationFlow, getVerificationStep]
  );

  const onSignInPress = useCallback(async () => {
    if (!isLoaded || !canSubmit || !signIn) return;

    clearVerificationFlow();
    setError('');
    setLoading(true);

    try {
      const signInAttempt = await signIn.create({
        strategy: 'password',
        identifier: emailAddress.trim(),
        password,
      });

      if (signInAttempt.status === 'complete') {
        await activateSession(signInAttempt.createdSessionId);
      } else {
        await handleIncompleteSignIn(signInAttempt);
      }
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }, [
    isLoaded,
    canSubmit,
    signIn,
    activateSession,
    clearVerificationFlow,
    handleIncompleteSignIn,
    emailAddress,
    password,
  ]);

  const onStartVerificationPress = useCallback(async () => {
    if (!isLoaded || !verificationOffer) return;

    setError('');
    setLoading(true);

    try {
      await startVerificationFlow(verificationOffer);
    } catch (err: unknown) {
      setError(
        extractClerkError(
          err,
          'We could not start verification. Please try signing in again.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, [isLoaded, startVerificationFlow, verificationOffer]);

  const onVerifyPress = useCallback(async () => {
    if (!isLoaded || !signIn || !pendingVerification || code.trim() === '')
      return;

    setError('');
    setLoading(true);

    try {
      const result =
        pendingVerification.stage === 'first_factor'
          ? await signIn.attemptFirstFactor({
              strategy: pendingVerification.strategy,
              code,
            })
          : await signIn.attemptSecondFactor({
              strategy: pendingVerification.strategy,
              code,
            });

      if (result.status === 'complete') {
        await activateSession(result.createdSessionId);
      } else {
        await handleIncompleteSignIn(result);
      }
    } catch (err: unknown) {
      setError(
        extractClerkError(err, 'Invalid verification code. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }, [
    isLoaded,
    pendingVerification,
    code,
    signIn,
    activateSession,
    handleIncompleteSignIn,
  ]);

  const onResendCode = useCallback(async () => {
    if (!isLoaded || !signIn || !pendingVerification || resending) return;

    setError('');
    setResending(true);

    try {
      if (
        pendingVerification.stage === 'first_factor' &&
        pendingVerification.strategy === 'email_code'
      ) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: pendingVerification.emailAddressId,
        });
      } else if (pendingVerification.strategy === 'email_code') {
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: pendingVerification.emailAddressId,
        });
      } else {
        await signIn.prepareSecondFactor({
          strategy: 'phone_code',
          ...(pendingVerification.phoneNumberId
            ? { phoneNumberId: pendingVerification.phoneNumberId }
            : {}),
        });
      }
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setResending(false);
    }
  }, [isLoaded, pendingVerification, resending, signIn]);

  const onBackFromVerification = useCallback(() => {
    clearVerificationFlow(true);
  }, [clearVerificationFlow]);

  if (pendingVerification) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-background items-center"
        behavior="padding"
      >
        <ScrollView
          ref={verifyScrollRef}
          className="flex-1"
          contentContainerStyle={{
            minHeight: SCREEN_HEIGHT,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View className="flex-1" style={{ minHeight: 40 }} />
          <Text className="text-h2 font-bold text-text-primary mb-1">
            Enter verification code
          </Text>
          <Text className="text-body-sm text-text-secondary mb-6">
            We sent a verification code to{' '}
            <Text
              className="text-body-sm text-text-secondary font-semibold"
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {pendingVerification.identifier}
            </Text>
          </Text>

          {error !== '' && (
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-4"
              accessibilityRole="alert"
            >
              <Text className="text-danger text-body-sm">{error}</Text>
            </View>
          )}

          <View onLayout={onVerifyFieldLayout('code')}>
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
              testID="sign-in-verify-code"
              onFocus={onVerifyFieldFocus('code')}
            />
          </View>

          <Button
            variant="primary"
            label="Verify"
            onPress={onVerifyPress}
            disabled={!canSubmitCode}
            loading={loading}
            testID="sign-in-verify-button"
          />

          <View className="flex-row justify-center mt-4">
            <Button
              variant="tertiary"
              size="small"
              label="Resend code"
              onPress={onResendCode}
              loading={resending}
              testID="sign-in-resend-code"
            />
          </View>

          <View className="flex-row justify-center mt-2">
            <Button
              variant="tertiary"
              size="small"
              label="Back to sign in"
              onPress={onBackFromVerification}
              testID="sign-in-back-from-verify"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background items-center"
      behavior="padding"
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={
          Platform.OS === 'web' ? { maxWidth: 480, width: '100%' } : undefined
        }
        contentContainerStyle={{
          minHeight: SCREEN_HEIGHT,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Brand logo at top of screen */}
        <View className="items-center mt-8 mb-8">
          <MentomateLogo size="md" />
        </View>
        {/* Spacer: pushes form content toward center. maxHeight caps the gap
            on tall screens so the logo and form stay visually connected. */}
        <View className="flex-1" style={{ minHeight: 16, maxHeight: 32 }} />
        <Text className="text-h2 font-bold text-text-primary mb-1 text-center">
          {isReturningUser ? 'Welcome back' : 'Welcome to MentoMate'}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-6 text-center">
          {isReturningUser
            ? 'Sign in to continue learning'
            : 'Sign in to start learning'}
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

        <View onLayout={onFieldLayout('email')}>
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
            onChangeText={(value) => {
              clearVerificationFlow(true);
              setEmailAddress(value);
            }}
            editable={!loading}
            testID="sign-in-email"
            onFocus={onFieldFocus('email')}
          />
        </View>

        <View onLayout={onFieldLayout('password')}>
          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            Password
          </Text>
          <View className="mb-2">
            <PasswordInput
              value={password}
              onChangeText={(value) => {
                clearVerificationFlow(true);
                setPassword(value);
              }}
              placeholder="Enter your password"
              editable={!loading}
              testID="sign-in-password"
              onSubmitEditing={onSignInPress}
              onFocus={onFieldFocus('password')}
            />
          </View>
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

        {verificationOffer && (
          <View
            className="bg-primary/10 rounded-card px-4 py-4 mt-4"
            testID="sign-in-verification-offer"
          >
            <Text className="text-body font-semibold text-text-primary">
              Additional verification is available
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              This account can continue with a verification code sent to{' '}
              <Text className="font-semibold text-text-primary">
                {verificationOffer.identifier}
              </Text>
              . We will only send the code if you choose to continue.
            </Text>
            <View className="mt-4">
              <Button
                variant="secondary"
                label="Send verification code"
                onPress={onStartVerificationPress}
                disabled={loading}
                loading={loading}
                testID="sign-in-start-verification"
              />
            </View>
          </View>
        )}

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
