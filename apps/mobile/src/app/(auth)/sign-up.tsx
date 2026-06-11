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
import { useSignUp, useSSO } from '@clerk/clerk-expo';
import { Trans, useTranslation } from 'react-i18next';
import { Sentry } from '../../lib/sentry';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useWebBrowserWarmup } from '../../hooks/use-web-browser-warmup';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import {
  getOpenAISSOStrategy,
  type SupportedSSOStrategy,
} from '../../lib/clerk-sso';
import { extractClerkError } from '../../lib/clerk-error';
import { PasswordInput } from '../../components/common';
import { Button } from '../../components/common/Button';
import { useKeyboardScroll } from '../../hooks/use-keyboard-scroll';
import { MentomateLogo } from '../../components/MentomateLogo';
import { markSessionActivated } from '../../lib/auth-transition';

// Captured at module load — safe because these screens are portrait-locked.
// On web, cap at a mobile-like height to avoid massive whitespace.
const SCREEN_HEIGHT =
  Platform.OS === 'web'
    ? Math.min(Dimensions.get('screen').height, 812)
    : Dimensions.get('screen').height;

export default function SignUpScreen() {
  const { t } = useTranslation();
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const { email: emailParam, fromSignIn } = useLocalSearchParams<{
    email?: string;
    fromSignIn?: string;
  }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [emailAddress, setEmailAddress] = useState(emailParam ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [pendingSessionActivationId, setPendingSessionActivationId] = useState<
    string | null
  >(null);
  const [activationFailureContext, setActivationFailureContext] = useState<
    'oauth' | 'verification' | null
  >(null);
  const { scrollRef, onFieldLayout, onFieldFocus } = useKeyboardScroll();
  const {
    scrollRef: verifyScrollRef,
    onFieldLayout: onVerifyFieldLayout,
    onFieldFocus: onVerifyFieldFocus,
  } = useKeyboardScroll();

  const { startSSOFlow } = useSSO();
  const openAIStrategy = getOpenAISSOStrategy();

  useWebBrowserWarmup();

  const canSubmitSignUp =
    emailAddress.trim() !== '' && password.length >= 8 && !loading;
  const canSubmitCode = code.trim() !== '' && !loading;

  const clearActivationFailure = useCallback(() => {
    setPendingSessionActivationId(null);
    setActivationFailureContext(null);
  }, []);

  const activateCreatedSession = useCallback(
    async (
      sessionId: string | null,
      context: 'oauth' | 'verification',
    ): Promise<boolean> => {
      if (!sessionId || !setActive) {
        setError('No session was created. Please try again.');
        return false;
      }

      try {
        await setActive({ session: sessionId });
        markSessionActivated();
        clearActivationFailure();
        return true;
      } catch {
        setPendingSessionActivationId(sessionId);
        setActivationFailureContext(context);
        setError('Could not activate your session. Please try again.');
        return false;
      }
    },
    [clearActivationFailure, setActive],
  );

  const retrySessionActivation = useCallback(async () => {
    if (!pendingSessionActivationId || !activationFailureContext) {
      return;
    }
    if (!isLoaded || !setActive) {
      setError('Authentication not ready. Please reload and try again.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await activateCreatedSession(
        pendingSessionActivationId,
        activationFailureContext,
      );
    } finally {
      setLoading(false);
    }
  }, [
    activateCreatedSession,
    activationFailureContext,
    isLoaded,
    pendingSessionActivationId,
    setActive,
  ]);

  const onSSOPress = useCallback(
    async (strategy: SupportedSSOStrategy) => {
      if (!isLoaded) return;
      clearActivationFailure();
      setError('');
      setOauthLoading(strategy);

      try {
        const ssoResult = await startSSOFlow({
          strategy,
          redirectUrl: Linking.createURL('/sso-callback', {
            scheme: 'mentomate',
          }),
        });

        const {
          createdSessionId,
          signIn: ssoSignIn,
          signUp: ssoSignUp,
        } = ssoResult;

        if (__DEV__)
          console.log(
            `[AUTH-DEBUG] sign-up SSO result → createdSessionId=${
              createdSessionId ?? 'null'
            }` +
              ` | signIn.status=${ssoSignIn?.status ?? 'null'}` +
              ` | signUp.status=${ssoSignUp?.status ?? 'null'}` +
              ` | signUp.createdSessionId=${
                ssoSignUp?.createdSessionId ?? 'null'
              }`,
          );

        // Session ID may be on top level or on signUp for new OAuth users
        const sessionId =
          createdSessionId ?? ssoSignUp?.createdSessionId ?? null;

        if (sessionId) {
          const activated = await activateCreatedSession(sessionId, 'oauth');
          if (!activated) {
            return;
          }
          // Auth layout guard handles navigation once isSignedIn propagates.
          return;
        }

        if (__DEV__)
          console.warn(
            `[AUTH-DEBUG] sign-up SSO: no session created.` +
              ` signIn.status=${ssoSignIn?.status ?? 'null'}` +
              ` signUp.status=${ssoSignUp?.status ?? 'null'}` +
              ` signUp.missingFields=${JSON.stringify(ssoSignUp?.missingFields ?? [])}`,
          );

        // Existing account: SSO matched an account that needs further sign-in
        // steps (e.g. TOTP, phone verification). Redirect to sign-in where
        // handleIncompleteSignIn can guide the user through the right factor.
        // [BUG-510] Emit a structured Sentry event so incomplete-signIn cases
        // are visible in observability — silent redirect alone is banned per
        // AGENTS.md "Silent recovery without escalation is banned."
        if (ssoSignIn?.status) {
          if (__DEV__)
            console.warn(
              `[AUTH-DEBUG] sign-up SSO: matched existing account, redirecting to sign-in.` +
                ` signIn.status=${ssoSignIn.status}`,
            );
          Sentry.captureMessage(
            'sign-up SSO: incomplete signIn — redirecting to sign-in',
            {
              level: 'info',
              tags: { flow: 'sign-up-sso', signInStatus: ssoSignIn.status },
            },
          );
          router.replace({
            pathname: '/(auth)/sign-in',
            params: { ssoNeedsSignIn: '1' },
          } as Parameters<typeof router.replace>[0]);
          return;
        }

        // New account: sign-up is incomplete because required profile fields
        // (e.g. username, phone) are missing. Surface what is needed.
        if (ssoSignUp?.missingFields && ssoSignUp.missingFields.length > 0) {
          const fields = (ssoSignUp.missingFields as string[]).join(', ');
          setError(
            `Sign-up needs more information: ${fields}. Please sign up with email instead.`,
          );
          return;
        }

        // Sign-up object exists but in an unexpected incomplete state.
        if (ssoSignUp?.status && ssoSignUp.status !== 'complete') {
          setError(
            `Sign-up via ${
              strategy === 'oauth_google' ? 'Google' : 'SSO'
            } needs additional information. Please sign up with email instead.`,
          );
          return;
        }

        setError('Sign-up could not be completed. Please try again.');
      } catch (err: unknown) {
        if (__DEV__) console.warn('[AUTH-DEBUG] sign-up SSO threw:', err);
        setError(extractClerkError(err));
      } finally {
        setOauthLoading(null);
      }
    },
    [activateCreatedSession, clearActivationFailure, isLoaded, startSSOFlow],
  );

  const onSignUpPress = useCallback(async () => {
    if (!isLoaded || !canSubmitSignUp) return;

    clearActivationFailure();
    setError('');
    setLoading(true);

    try {
      if (__DEV__)
        console.log(
          `[AUTH-DEBUG] signUp.create → email=${emailAddress.trim()}`,
        );
      await signUp.create({ emailAddress, password });
      if (__DEV__)
        console.log(
          `[AUTH-DEBUG] signUp.create → status=${signUp.status}` +
            ` | createdSessionId=${signUp.createdSessionId ?? 'null'}`,
        );
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      if (__DEV__)
        console.log('[AUTH-DEBUG] prepareEmailAddressVerification → OK');
      setPendingVerification(true);
    } catch (err: unknown) {
      if (__DEV__) console.warn('[AUTH-DEBUG] signUp flow threw:', err);
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }, [
    clearActivationFailure,
    isLoaded,
    canSubmitSignUp,
    signUp,
    emailAddress,
    password,
  ]);

  const onVerifyPress = useCallback(async () => {
    if (!isLoaded || !canSubmitCode) return;

    setError('');
    setLoading(true);

    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (signUpAttempt.status === 'complete') {
        const activated = await activateCreatedSession(
          signUpAttempt.createdSessionId,
          'verification',
        );
        if (!activated) {
          return;
        }
        // Auth layout guard handles navigation once isSignedIn propagates.
      } else {
        setError('Verification could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      setError(
        extractClerkError(err, 'Invalid verification code. Please try again.'),
      );
    } finally {
      setLoading(false);
    }
  }, [activateCreatedSession, isLoaded, canSubmitCode, signUp, code]);

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
    clearActivationFailure();
  }, [clearActivationFailure]);

  if (pendingVerification) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-background items-center"
        behavior="padding"
      >
        <ScrollView
          ref={verifyScrollRef}
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
          <View className="flex-1" style={{ minHeight: 40 }} />
          <Text className="text-h2 font-bold text-text-primary mb-1">
            {t('auth.signUp.verifyEmailTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-6">
            <Trans
              i18nKey="auth.signUp.sentCodeTo"
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

          <View onLayout={onVerifyFieldLayout('code')}>
            <Text className="text-body-sm font-semibold text-text-secondary mb-1">
              {t('auth.signUp.verificationCodeLabel')}
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
              onFocus={onVerifyFieldFocus('code')}
            />
          </View>

          <Button
            variant="primary"
            label="Verify"
            onPress={onVerifyPress}
            disabled={!canSubmitCode}
            loading={loading}
            testID="sign-up-verify-button"
          />

          {activationFailureContext === 'verification' &&
          pendingSessionActivationId ? (
            <View className="flex-row justify-center mt-3">
              <Button
                variant="secondary"
                size="small"
                label="Try Again"
                onPress={() => void retrySessionActivation()}
                disabled={loading}
                testID="sign-up-retry-activation"
              />
            </View>
          ) : null}

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

          <View className="flex-row justify-center mt-2">
            <Button
              variant="tertiary"
              size="small"
              label="Back to sign in"
              onPress={() => router.replace('/(auth)/sign-in')}
              testID="verify-back-to-sign-in"
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
      testID="sign-up-screen"
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
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        testID="sign-up-scroll"
      >
        <View testID="sign-up-content">
          {/* Brand logo at top of screen — keep margins tight so the primary CTA
            stays above the first viewport on small phones (~5.8"). BUG-959:
            no flex-1 spacer between logo and heading — guarded by the
            'does not insert a flex-1 spacer' test in sign-up.test.tsx. */}
          <View className="items-center mt-2 mb-2">
            <MentomateLogo size="sm" />
          </View>
          <Text
            className="text-h2 font-bold text-text-primary mb-1"
            testID="sign-up-heading"
          >
            {t('auth.signUp.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-4">
            {t('auth.signUp.subtitle')}
          </Text>

          {fromSignIn === '1' && (
            <View
              className="bg-primary/10 rounded-card px-4 py-3 mb-4"
              accessibilityRole="alert"
            >
              <Text className="text-body-sm text-text-primary">
                {t('auth.signUp.accountNotFound')}
              </Text>
            </View>
          )}

          {error !== '' && (
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-4"
              accessibilityRole="alert"
            >
              <Text className="text-danger text-body-sm">{error}</Text>
            </View>
          )}

          {activationFailureContext === 'oauth' &&
          pendingSessionActivationId ? (
            <>
              <View className="mb-3">
                <Button
                  variant="secondary"
                  label="Try Again"
                  onPress={() => void retrySessionActivation()}
                  disabled={loading || oauthLoading !== null}
                  testID="sign-up-oauth-retry"
                />
              </View>
              <View className="mb-4">
                <Button
                  variant="tertiary"
                  label="Try another method"
                  onPress={() => {
                    clearActivationFailure();
                    setError('');
                  }}
                  testID="sign-up-oauth-clear"
                />
              </View>
            </>
          ) : null}

          {Platform.OS !== 'ios' && (
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
          )}

          {Platform.OS === 'ios' && (
            <View className="mb-3">
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

          {openAIStrategy ? (
            <View className="mb-3">
              <Button
                variant="secondary"
                label="Continue with OpenAI"
                onPress={() => onSSOPress(openAIStrategy)}
                disabled={oauthLoading !== null}
                loading={oauthLoading === openAIStrategy}
                testID="sign-up-openai-sso"
              />
            </View>
          ) : null}

          <View className="flex-row items-center mb-3">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-body-sm text-text-secondary mx-4">
              {t('auth.signUp.orContinueWithEmail')}
            </Text>
            <View className="flex-1 h-px bg-border" />
          </View>

          <View onLayout={onFieldLayout('email')}>
            <Text className="text-body-sm font-semibold text-text-secondary mb-1">
              {t('auth.signUp.emailLabel')}
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
              onFocus={onFieldFocus('email')}
            />
          </View>

          <View onLayout={onFieldLayout('password')}>
            <Text className="text-body-sm font-semibold text-text-secondary mb-1">
              {t('auth.signUp.passwordLabel')}
            </Text>
            <View className="mb-4">
              <PasswordInput
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                editable={!loading}
                testID="sign-up-password"
                showRequirements
                onSubmitEditing={onSignUpPress}
                onFocus={onFieldFocus('password')}
              />
            </View>
          </View>

          {/* [BUG-591] Mount point for Clerk Smart CAPTCHA widget.
           * On web, RN-Web translates nativeID -> DOM id="clerk-captcha";
           * Clerk's signUp.create() needs this element present in the form
           * view to attach the widget. On iOS/Android this is a no-op View. */}
          <View nativeID="clerk-captcha" testID="clerk-captcha" />

          <Button
            variant="primary"
            label="Sign up"
            onPress={onSignUpPress}
            disabled={!canSubmitSignUp}
            loading={loading}
            testID="sign-up-button"
          />

          <View
            className="flex-row justify-center items-center mt-3 mb-3"
            testID="sign-up-back-to-sign-in-row"
          >
            <Text className="text-body-sm text-text-secondary">
              {t('auth.signUp.alreadyHaveAccount')}{' '}
            </Text>
            <Button
              variant="tertiary"
              size="small"
              label="Sign in"
              onPress={() => router.replace('/(auth)/sign-in')}
              testID="sign-in-link"
            />
          </View>

          <Text
            className="text-caption text-text-secondary text-center px-2 mb-8"
            testID="sign-up-terms-copy"
          >
            <Trans
              i18nKey="auth.signUp.agreeToTerms"
              components={{
                terms: (
                  <Text
                    className="text-primary"
                    onPress={() => router.push('/terms')}
                    accessibilityRole="link"
                  />
                ),
                privacy: (
                  <Text
                    className="text-primary"
                    onPress={() => router.push('/privacy')}
                    accessibilityRole="link"
                  />
                ),
              }}
            />
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
