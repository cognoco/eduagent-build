import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { goBackOrReplace } from '../../lib/navigation';
import { extractClerkError } from '../../lib/clerk-error';
import { markSessionActivated } from '../../lib/auth-transition';
import { PasswordInput } from '../../components/common';
import { Button } from '../../components/common/Button';
import { useKeyboardScroll } from '../../hooks/use-keyboard-scroll';
import { Sentry } from '../../lib/sentry';

// Captured at module load — safe because these screens are portrait-locked.
// On web, cap at a mobile-like height to avoid massive whitespace.
const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

// [#617 / AUTH-06] Clerk's signIn.create / signIn.attemptFirstFactor can hang
// indefinitely (network stall, dev email delivery issue, test-mode mismatch).
// Without a client-side timeout, `loading` never flips back to false and the
// user is stranded on a disabled spinner with no actionable recovery. The
// helper below caps every Clerk call at 20s, surfaces a clear message, and
// re-enables the button.
const RESET_REQUEST_TIMEOUT_MS = 20_000;
const RESET_TIMEOUT_USER_MESSAGE =
  "We couldn't reach the reset service in time. Check your connection and try again.";

class ResetRequestTimeoutError extends Error {
  constructor(public readonly operation: string) {
    super(
      `Reset request timed out after ${RESET_REQUEST_TIMEOUT_MS}ms: ${operation}`,
    );
    this.name = 'ResetRequestTimeoutError';
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs: number = RESET_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ResetRequestTimeoutError(operation));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
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
  // [#511] Preserved after setActive() throws so the retry button can re-attempt
  // without the user having to redo the whole reset flow. The code is single-use
  // in Clerk, so the form fields are NOT re-shown — only the retry / fallback
  // sign-in buttons are presented.
  const [pendingActivationSessionId, setPendingActivationSessionId] = useState<
    string | null
  >(null);
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();
  const {
    scrollRef: resetScrollRef,
    onFieldLayout: onResetFieldLayout,
    onFieldFocus: onResetFieldFocus,
  } = useKeyboardScroll();

  const canSubmitEmail = emailAddress.trim() !== '' && !loading;
  const canSubmitReset =
    code.trim() !== '' && newPassword.length >= 8 && !loading;

  const onSendCodePress = useCallback(async () => {
    if (!isLoaded || !canSubmitEmail) return;

    setError('');
    setLoading(true);

    try {
      await withTimeout(
        signIn.create({
          strategy: 'reset_password_email_code',
          identifier: emailAddress,
        }),
        'signIn.create',
      );
      setPendingReset(true);
    } catch (err: unknown) {
      if (err instanceof ResetRequestTimeoutError) {
        Sentry.addBreadcrumb({
          category: 'auth',
          message: 'forgot-password: signIn.create timed out',
          level: 'warning',
          data: {
            operation: err.operation,
            timeoutMs: RESET_REQUEST_TIMEOUT_MS,
          },
        });
        setError(RESET_TIMEOUT_USER_MESSAGE);
      } else {
        setError(extractClerkError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [isLoaded, canSubmitEmail, signIn, emailAddress]);

  const onResetPress = useCallback(async () => {
    if (!isLoaded || !canSubmitReset) return;

    setError('');
    setLoading(true);

    try {
      const result = await withTimeout(
        signIn.attemptFirstFactor({
          strategy: 'reset_password_email_code',
          code,
          password: newPassword,
        }),
        'signIn.attemptFirstFactor',
      );

      if (result.status === 'complete') {
        const sessionId = result.createdSessionId;
        try {
          await setActive({ session: sessionId });
          markSessionActivated();
          setPendingActivationSessionId(null);
        } catch (activateErr) {
          // [#511] setActive threw after a successful server-side reset.
          // Store the sessionId so the retry button can re-attempt setActive
          // without losing it across re-renders. The reset code is single-use
          // in Clerk, so re-attempting the form is not possible.
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'forgot-password: setActive threw after successful reset',
            level: 'warning',
            data: { sessionId, error: String(activateErr) },
          });
          setPendingActivationSessionId(sessionId);
          setError(
            'Your password was reset but we could not sign you in automatically.',
          );
          return;
        }
        // Auth layout guard handles navigation once isSignedIn propagates.
      } else {
        setError('Password reset could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      if (err instanceof ResetRequestTimeoutError) {
        Sentry.addBreadcrumb({
          category: 'auth',
          message: 'forgot-password: signIn.attemptFirstFactor timed out',
          level: 'warning',
          data: {
            operation: err.operation,
            timeoutMs: RESET_REQUEST_TIMEOUT_MS,
          },
        });
        setError(RESET_TIMEOUT_USER_MESSAGE);
      } else {
        setError(extractClerkError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [isLoaded, canSubmitReset, signIn, setActive, code, newPassword]);

  // [#511] Retry setActive with the preserved sessionId after a transient failure.
  const onRetryActivation = useCallback(async () => {
    if (!isLoaded || !pendingActivationSessionId) return;

    setError('');
    setLoading(true);

    try {
      await setActive({ session: pendingActivationSessionId });
      markSessionActivated();
      setPendingActivationSessionId(null);
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'forgot-password: retry setActive also threw',
        level: 'error',
        data: { error: String(err) },
      });
      setError(
        'Still unable to sign you in. Use the link below to sign in with your new password.',
      );
    } finally {
      setLoading(false);
    }
  }, [isLoaded, pendingActivationSessionId, setActive]);

  const onResendCode = useCallback(async () => {
    if (!isLoaded || resending) return;

    setError('');
    setResending(true);

    try {
      await withTimeout(
        signIn.create({
          strategy: 'reset_password_email_code',
          identifier: emailAddress,
        }),
        'signIn.create(resend)',
      );
    } catch (err: unknown) {
      if (err instanceof ResetRequestTimeoutError) {
        Sentry.addBreadcrumb({
          category: 'auth',
          message: 'forgot-password: resend signIn.create timed out',
          level: 'warning',
          data: {
            operation: err.operation,
            timeoutMs: RESET_REQUEST_TIMEOUT_MS,
          },
        });
        setError(RESET_TIMEOUT_USER_MESSAGE);
      } else {
        setError(extractClerkError(err));
      }
    } finally {
      setResending(false);
    }
  }, [isLoaded, resending, signIn, emailAddress]);

  const onBackFromReset = useCallback(() => {
    setPendingReset(false);
    setCode('');
    setNewPassword('');
    setError('');
    setPendingActivationSessionId(null);
  }, []);

  if (pendingReset) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-background items-center"
        behavior="padding"
      >
        <ScrollView
          ref={resetScrollRef}
          className="flex-1"
          style={{
            width: '100%',
            ...(Platform.OS === 'web' ? { maxWidth: 480 } : undefined),
          }}
          contentContainerStyle={{
            minHeight: SCREEN_HEIGHT,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* Top spacer: see sign-in.tsx BUG-24 comment */}
          <View className="flex-1" style={{ minHeight: 40 }} />
          <Text
            className="text-h2 font-bold text-text-primary mb-1"
            accessibilityRole="header"
          >
            {t('auth.forgotPassword.resetPasswordTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-6">
            <Trans
              i18nKey="auth.forgotPassword.enterCodeAndPassword"
              values={{ email: emailAddress }}
              components={{
                email: (
                  <Text
                    className="text-body-sm text-text-secondary font-semibold"
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  />
                ),
              }}
            />
          </Text>

          {error !== '' && (
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-4"
              accessibilityRole="alert"
            >
              <Text className="text-danger text-body-sm">{error}</Text>
            </View>
          )}

          {/* [#511] setActive threw after successful server-side reset.
              The reset code is single-use in Clerk; the form fields are
              inoperable. Show retry + fallback navigation instead. */}
          {pendingActivationSessionId !== null ? (
            <View className="gap-3">
              <Button
                variant="primary"
                label="Try Again"
                onPress={() => void onRetryActivation()}
                loading={loading}
                testID="reset-retry-activation"
              />
              <View className="flex-row justify-center mt-2">
                <Button
                  variant="tertiary"
                  size="small"
                  label="Sign in with your new password"
                  onPress={() =>
                    router.push({
                      pathname: '/(auth)/sign-in',
                      params: { notice: 'reset_success' },
                    })
                  }
                  testID="reset-continue-to-sign-in"
                />
              </View>
            </View>
          ) : (
            <>
              <View onLayout={onResetFieldLayout('code')}>
                <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                  {t('auth.forgotPassword.resetCodeLabel')}
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
                  onFocus={onResetFieldFocus('code')}
                />
              </View>

              <View onLayout={onResetFieldLayout('password')}>
                <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                  {t('auth.forgotPassword.newPasswordLabel')}
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
                    onFocus={onResetFieldFocus('password')}
                  />
                </View>
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

              <View className="flex-row justify-center mt-2">
                <Button
                  variant="tertiary"
                  size="small"
                  label="Back to sign in"
                  onPress={() => router.push('/(auth)/sign-in')}
                  testID="reset-back-to-sign-in"
                />
              </View>
            </>
          )}
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
        style={{
          width: '100%',
          ...(Platform.OS === 'web' ? { maxWidth: 480 } : undefined),
        }}
        contentContainerStyle={{
          minHeight: SCREEN_HEIGHT,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* BUG-19: Reduced top spacer — forgot-password has fewer fields than
            sign-in, so flex-1 pushed content excessively to the bottom. */}
        <View style={{ minHeight: 40, flex: 0.3 }} />
        <Text
          className="text-h2 font-bold text-text-primary mb-1"
          accessibilityRole="header"
        >
          {t('auth.forgotPassword.title')}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-6">
          {t('auth.forgotPassword.subtitle')}
        </Text>

        {error !== '' && (
          <View
            className="bg-danger/10 rounded-card px-4 py-3 mb-4"
            accessibilityRole="alert"
          >
            <Text className="text-danger text-body-sm">{error}</Text>
          </View>
        )}

        <View onLayout={onFieldLayout('email')}>
          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            {t('auth.forgotPassword.emailLabel')}
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
            onFocus={onFieldFocus('email')}
          />
        </View>

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
            onPress={() => goBackOrReplace(router, '/sign-in' as const)}
            testID="back-to-sign-in"
          />
        </View>

        {/* BUG-19: Bottom spacer to balance the top flex-1 spacer.
            Without this, content is pushed down with excessive empty space below. */}
        <View className="flex-1" style={{ minHeight: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
