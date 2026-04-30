import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SecureStore from '../../lib/secure-storage';
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
import {
  markSessionActivated,
  isWithinTransitionWindow,
  clearTransitionState,
  getTransitionElapsed,
  SESSION_TRANSITION_MS,
} from '../../lib/auth-transition';
import { consumeSessionExpiredNotice } from '../../lib/auth-expiry';
import {
  readWebSearchParam,
  toInternalAppRedirectPath,
} from '../../lib/normalize-redirect-path';
import {
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';
import { ErrorFallback } from '../../components/common/ErrorFallback';

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
    }
  | {
      stage: VerificationStage;
      strategy: 'totp';
    }
  | {
      stage: VerificationStage;
      strategy: 'backup_code';
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

type TotpFactor = {
  strategy: 'totp';
};

type BackupCodeFactor = {
  strategy: 'backup_code';
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

function isTotpFactor(factor: unknown): factor is TotpFactor {
  return (
    typeof factor === 'object' &&
    factor !== null &&
    'strategy' in factor &&
    factor.strategy === 'totp'
  );
}

function isBackupCodeFactor(factor: unknown): factor is BackupCodeFactor {
  return (
    typeof factor === 'object' &&
    factor !== null &&
    'strategy' in factor &&
    factor.strategy === 'backup_code'
  );
}

function getFactorStrategies(factors: unknown[] | null | undefined): string[] {
  const strategies = new Set<string>();
  for (const factor of factors ?? []) {
    if (
      typeof factor === 'object' &&
      factor !== null &&
      'strategy' in factor &&
      typeof factor.strategy === 'string'
    ) {
      strategies.add(factor.strategy);
    }
  }
  return Array.from(strategies);
}

function hasSSOProviders(factors: unknown[] | null | undefined): boolean {
  return (factors ?? []).some(
    (f) =>
      typeof f === 'object' &&
      f !== null &&
      'strategy' in f &&
      typeof (f as Record<string, unknown>).strategy === 'string' &&
      ((f as Record<string, unknown>).strategy as string).startsWith('oauth_')
  );
}

function describeVerificationStrategy(strategy: string): string {
  switch (strategy) {
    case 'webauthn':
      return 'a security key or passkey';
    case 'totp':
      return 'an authenticator app';
    case 'phone_code':
      return 'a phone verification code';
    case 'email_code':
      return 'an email verification code';
    default:
      return strategy.replace(/_/g, ' ');
  }
}

function formatUnsupportedVerificationMessage(strategies: string[]): string {
  if (strategies.length === 0) {
    return 'This account needs an additional verification method that is not available on mobile yet.';
  }

  const [first] = strategies;
  if (strategies.length === 1 && first) {
    return `This account requires ${describeVerificationStrategy(
      first
    )} which isn't available on mobile yet.`;
  }

  const described = strategies.map(describeVerificationStrategy);
  const last = described.pop();
  return `This account requires ${described.join(
    ', '
  )} or ${last} which isn't available on mobile yet.`;
}

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const params = useLocalSearchParams<{
    redirectTo?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const localRedirectTarget = Array.isArray(params.redirectTo)
    ? params.redirectTo[0]
    : params.redirectTo;
  const browserRedirectTarget = readWebSearchParam('redirectTo');
  const requestedRedirectTarget = toInternalAppRedirectPath(
    localRedirectTarget ?? browserRedirectTarget ?? undefined,
    peekPendingAuthRedirect() ?? '/(app)/home'
  );
  const requestedRedirectRef = useRef(
    localRedirectTarget || browserRedirectTarget
      ? rememberPendingAuthRedirect(requestedRedirectTarget)
      : requestedRedirectTarget
  );

  if (localRedirectTarget || browserRedirectTarget) {
    requestedRedirectRef.current = rememberPendingAuthRedirect(
      requestedRedirectTarget
    );
  }

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
  const [
    unsupportedVerificationStrategies,
    setUnsupportedVerificationStrategies,
  ] = useState<string[]>([]);
  const [unsupportedHasSSOProviders, setUnsupportedHasSSOProviders] =
    useState(false);
  const [code, setCode] = useState('');
  const [resending, setResending] = useState(false);
  // Guard against stale closures calling activateSession after unmount
  // (e.g. during sign-out → remount transitions)
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [pendingSessionActivationId, setPendingSessionActivationId] = useState<
    string | null
  >(null);
  const [activationFailureContext, setActivationFailureContext] = useState<
    'oauth' | 'password' | 'verification' | null
  >(null);
  // Survives remounts: if setActive() just fired, show spinner not empty form
  const [isTransitioning, setIsTransitioning] = useState(
    isWithinTransitionWindow
  );
  // True when SESSION_TRANSITION_MS has elapsed but the auth guard still hasn't
  // redirected — show ErrorFallback instead of bare spinner.
  const [transitionStuck, setTransitionStuck] = useState(false);
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

  // Safety timeouts: if the auth layout guard never redirects (e.g. stale
  // token → signOut → remount), show ErrorFallback after SESSION_TRANSITION_MS
  // then fall back to the sign-in form after a further 15s.
  useEffect(() => {
    if (!isTransitioning) return;
    const remaining = Math.max(
      100,
      SESSION_TRANSITION_MS - getTransitionElapsed()
    );
    // Phase 1: SESSION_TRANSITION_MS elapsed → show ErrorFallback ("stuck")
    const phase1 = setTimeout(() => {
      if (__DEV__)
        console.warn(
          `[AUTH-DEBUG] transitioning phase-1 TIMEOUT after ${SESSION_TRANSITION_MS}ms — showing stuck fallback`
        );
      setTransitionStuck(true);
    }, remaining);
    // Phase 2: 15s after phase 1 → give up entirely and reset to sign-in form
    const phase2 = setTimeout(() => {
      if (__DEV__)
        console.warn(
          '[AUTH-DEBUG] transitioning phase-2 TIMEOUT — falling back to sign-in form'
        );
      clearTransitionState();
      setTransitionStuck(false);
      setIsTransitioning(false);
      setError(
        'Sign-in is taking longer than expected. Please try signing in again.'
      );
    }, remaining + 15_000);
    return () => {
      clearTimeout(phase1);
      clearTimeout(phase2);
    };
  }, [isTransitioning]);

  const { startSSOFlow } = useSSO();
  const openAIStrategy = getOpenAISSOStrategy();

  useWebBrowserWarmup();

  const canSubmit = emailAddress.trim() !== '' && password !== '' && !loading;
  const canSubmitCode =
    pendingVerification !== null && code.trim() !== '' && !loading;
  const clearVerificationFlow = useCallback(
    (clearError = false) => {
      setVerificationOffer(null);
      setPendingVerification(null);
      setUnsupportedVerificationStrategies([]);
      setUnsupportedHasSSOProviders(false);
      setCode('');
      setPendingSessionActivationId(null);
      setActivationFailureContext(null);
      if (clearError) {
        setError('');
      }
    },
    [setError]
  );

  useEffect(() => {
    if (consumeSessionExpiredNotice()) {
      clearVerificationFlow();
      setError('Your session expired. Sign in again to continue learning.');
    }
  }, [clearVerificationFlow]);

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
        // TOTP (authenticator app) takes priority — no network round-trip needed
        const totpFactor =
          attempt.supportedSecondFactors?.find(isTotpFactor) ?? null;
        if (totpFactor) {
          return {
            stage: 'second_factor',
            strategy: 'totp',
          } as const;
        }

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

        const backupCodeFactor =
          attempt.supportedSecondFactors?.find(isBackupCodeFactor) ?? null;
        if (backupCodeFactor) {
          return {
            stage: 'second_factor',
            strategy: 'backup_code',
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

      // TOTP and backup_code don't need a prepare step — codes are generated
      // locally or pre-saved. Go straight to the code entry screen.
      if (step.strategy !== 'totp' && step.strategy !== 'backup_code') {
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
            ...(step.phoneNumberId
              ? { phoneNumberId: step.phoneNumberId }
              : {}),
          });
        }
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
      if (__DEV__)
        console.log(
          `[AUTH-DEBUG] handleIncompleteSignIn → status=${
            attempt.status
          } | nextStep=${
            nextVerificationStep
              ? `${nextVerificationStep.stage}/${nextVerificationStep.strategy}`
              : 'null'
          }`
        );
      if (nextVerificationStep) {
        // Auto-send the verification code instead of showing the passive
        // "Additional verification available" banner.  Client Trust in Clerk
        // keeps re-enabling itself; this makes the flow seamless regardless.
        try {
          await startVerificationFlow(nextVerificationStep);
        } catch {
          // If auto-send fails, fall back to the manual offer banner so the
          // user can still tap "Send verification code" themselves.
          setVerificationOffer(nextVerificationStep);
          setPendingVerification(null);
          setCode('');
        }
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
        const unsupportedStrategies = getFactorStrategies(
          attempt.status === 'needs_first_factor'
            ? attempt.supportedFirstFactors
            : attempt.supportedSecondFactors
        );
        const ssoAvailable = hasSSOProviders(attempt.supportedFirstFactors);
        setUnsupportedVerificationStrategies(unsupportedStrategies);
        setUnsupportedHasSSOProviders(ssoAvailable);
        setError(formatUnsupportedVerificationMessage(unsupportedStrategies));
        return;
      }

      setError('Sign-in could not be completed. Please try again.');
    },
    [clearVerificationFlow, getVerificationStep, startVerificationFlow]
  );

  const onContactSupport = useCallback(async () => {
    const describedMethods =
      unsupportedVerificationStrategies.length > 0
        ? unsupportedVerificationStrategies
            .map(describeVerificationStrategy)
            .join(', ')
        : 'an unsupported verification method';

    try {
      await Linking.openURL(
        `mailto:support@mentomate.app?subject=${encodeURIComponent(
          'Unsupported sign-in verification'
        )}&body=${encodeURIComponent(
          `Hi, I need help signing in on mobile because my account requires ${describedMethods}.`
        )}`
      );
    } catch {
      setError(
        `We couldn't open your email app. Please contact support@mentomate.app and mention ${describedMethods}.`
      );
    }
  }, [unsupportedVerificationStrategies]);

  const activateSession = useCallback(
    async (
      sessionId: string | null,
      context: 'oauth' | 'password' | 'verification'
    ): Promise<boolean> => {
      if (!isMountedRef.current) return false;
      if (!sessionId) {
        setError('No session was created. Please try again.');
        return false;
      }
      if (!setActive) {
        setError('Authentication not loaded. Please try again.');
        return false;
      }

      try {
        rememberPendingAuthRedirect(requestedRedirectRef.current);
        if (__DEV__)
          console.log(
            `[AUTH-DEBUG] activateSession → calling setActive(${sessionId}) context=${context}`
          );
        await setActive({ session: sessionId });
        if (__DEV__)
          console.log('[AUTH-DEBUG] activateSession → setActive resolved OK');
      } catch (e) {
        if (__DEV__)
          console.warn('[AUTH-DEBUG] activateSession → setActive THREW', e);
        setPendingSessionActivationId(sessionId);
        setActivationFailureContext(context);
        setError('Could not activate your session. Please try again.');
        return false;
      }

      // Show "Signing you in…" spinner immediately — before clearing form
      // state, so the user never sees a flash of the empty sign-in form.
      // The module-level timestamp lets this survive component remounts
      // if the redirect briefly bounces back.
      markSessionActivated();
      setIsTransitioning(true);

      setPendingSessionActivationId(null);
      setActivationFailureContext(null);
      setPendingVerification(null);
      setVerificationOffer(null);
      setCode('');
      void SecureStore.setItemAsync(HAS_SIGNED_IN_KEY, 'true').catch(() => {
        /* non-fatal */
      });
      // Don't navigate explicitly — the auth layout guard redirects to
      // /(app)/home once Clerk's useAuth() state propagates with
      // isSignedIn: true.  Calling router.replace() here races with Clerk's
      // React state update: the app layout renders before isSignedIn
      // flips, sees !isSignedIn, and bounces back to sign-in.
      return true;
    },
    [setActive]
  );

  const onSSOPress = useCallback(
    async (strategy: SupportedSSOStrategy) => {
      if (!isLoaded) return;
      clearVerificationFlow();
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
            `[AUTH-DEBUG] SSO result → createdSessionId=${
              createdSessionId ?? 'null'
            }` +
              ` | signIn.status=${ssoSignIn?.status ?? 'null'}` +
              ` | signUp.status=${ssoSignUp?.status ?? 'null'}` +
              ` | signUp.createdSessionId=${
                ssoSignUp?.createdSessionId ?? 'null'
              }`
          );

        // Session ID may be on the top level, or on signUp for new users
        const sessionId =
          createdSessionId ?? ssoSignUp?.createdSessionId ?? null;

        if (sessionId) {
          const activated = await activateSession(sessionId, 'oauth');
          if (!activated) {
            return;
          }
          void SecureStore.setItemAsync(HAS_SIGNED_IN_KEY, 'true').catch(() => {
            /* non-fatal */
          });
          // Auth layout guard handles navigation once isSignedIn propagates.
          return;
        }

        // SSO returned but no session — provide specific diagnostics
        if (ssoSignIn?.status) {
          if (__DEV__)
            console.warn(
              `[AUTH-DEBUG] SSO signIn incomplete: status=${ssoSignIn.status}`,
              JSON.stringify(
                ssoSignIn.supportedFirstFactors?.map(
                  (f: Record<string, unknown>) => f.strategy
                )
              )
            );
          await handleIncompleteSignIn(ssoSignIn);
          return;
        }

        if (ssoSignUp?.status && ssoSignUp.status !== 'complete') {
          if (__DEV__)
            console.warn(
              `[AUTH-DEBUG] SSO signUp incomplete: status=${ssoSignUp.status}` +
                ` | missingFields=${JSON.stringify(
                  ssoSignUp.missingFields ?? []
                )}`
            );
          setError(
            `Sign-up via ${
              strategy === 'oauth_google' ? 'Google' : 'SSO'
            } needs additional information. Please sign up with email instead.`
          );
          return;
        }

        setError('Sign-in could not be completed. Please try again.');
      } catch (err: unknown) {
        if (__DEV__) console.warn('[AUTH-DEBUG] SSO flow threw:', err);
        setError(extractClerkError(err));
      } finally {
        setOauthLoading(null);
      }
    },
    [
      activateSession,
      clearVerificationFlow,
      handleIncompleteSignIn,
      isLoaded,
      startSSOFlow,
    ]
  );

  const retrySessionActivation = useCallback(async () => {
    if (!isMountedRef.current) return;
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
      await activateSession(
        pendingSessionActivationId,
        activationFailureContext
      );
    } finally {
      setLoading(false);
    }
  }, [
    activateSession,
    activationFailureContext,
    isLoaded,
    pendingSessionActivationId,
    setActive,
  ]);

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

      if (__DEV__)
        console.log(
          `[AUTH-DEBUG] signIn.create → status=${
            signInAttempt.status
          } | sessionId=${
            signInAttempt.createdSessionId ?? 'null'
          } | firstFactors=${JSON.stringify(
            (signInAttempt.supportedFirstFactors ?? []).map(
              (f: Record<string, unknown>) => f.strategy
            )
          )}`
        );

      if (signInAttempt.status === 'complete') {
        await activateSession(signInAttempt.createdSessionId, 'password');
      } else {
        await handleIncompleteSignIn(signInAttempt);
      }
    } catch (err: unknown) {
      const clerkErrors = (err as { errors?: { code?: string }[] }).errors;
      if (clerkErrors?.[0]?.code === 'form_identifier_not_found') {
        // Account doesn't exist — redirect to sign-up with email pre-filled
        router.push({
          pathname: '/(auth)/sign-up',
          params: { email: emailAddress.trim(), fromSignIn: '1' },
        });
        return;
      }
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
    router,
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
      if (__DEV__)
        console.log(
          `[AUTH-DEBUG] onVerifyPress → attempting ${pendingVerification.stage} / ${pendingVerification.strategy}`
        );
      const result =
        pendingVerification.stage === 'first_factor'
          ? await signIn.attemptFirstFactor({
              strategy: pendingVerification.strategy as
                | 'email_code'
                | 'phone_code',
              code,
            })
          : await signIn.attemptSecondFactor({
              strategy: pendingVerification.strategy,
              code,
            });

      if (__DEV__)
        console.log(
          `[AUTH-DEBUG] onVerifyPress → result.status=${
            result.status
          } | sessionId=${result.createdSessionId ?? 'null'}`
        );

      if (result.status === 'complete') {
        await activateSession(result.createdSessionId, 'verification');
      } else {
        if (__DEV__)
          console.warn(
            `[AUTH-DEBUG] onVerifyPress → NOT complete, calling handleIncompleteSignIn`
          );
        await handleIncompleteSignIn(result);
      }
    } catch (err: unknown) {
      if (__DEV__) console.warn('[AUTH-DEBUG] onVerifyPress → THREW', err);
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
    if (pendingVerification.strategy === 'backup_code') return;

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
      } else if (pendingVerification.strategy === 'phone_code') {
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

  // After setActive() succeeds, show a spinner until the auth layout guard
  // redirects to /(app)/home.  This prevents the user from ever seeing
  // a flash of the empty sign-in form during the Clerk state propagation.
  if (isTransitioning) {
    if (transitionStuck) {
      return (
        <View
          className="flex-1 bg-background"
          testID="sign-in-transitioning-stuck"
        >
          <ErrorFallback
            variant="centered"
            title="Still signing you in"
            message="This is taking longer than expected. Try again."
            primaryAction={{
              label: 'Try again',
              testID: 'sign-in-stuck-retry',
              onPress: () => {
                clearTransitionState();
                setTransitionStuck(false);
                setIsTransitioning(false);
              },
            }}
            secondaryAction={{
              label: 'Sign up',
              testID: 'sign-in-stuck-signup',
              onPress: () => {
                clearTransitionState();
                setTransitionStuck(false);
                setIsTransitioning(false);
                router.replace('/(auth)/sign-up');
              },
            }}
          />
        </View>
      );
    }
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="sign-in-transitioning"
      >
        <ActivityIndicator size="large" accessibilityLabel="Signing you in" />
        <Text className="text-body text-text-secondary mt-4">
          Signing you in…
        </Text>
      </View>
    );
  }

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
            {pendingVerification.strategy === 'totp'
              ? 'Enter authenticator code'
              : pendingVerification.strategy === 'backup_code'
              ? 'Enter a backup code'
              : 'Enter verification code'}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-6">
            {pendingVerification.strategy === 'totp' ? (
              'Open your authenticator app and enter the 6-digit code.'
            ) : pendingVerification.strategy === 'backup_code' ? (
              'Enter one of the backup codes you saved when you set up two-factor authentication.'
            ) : (
              <>
                We sent a verification code to{' '}
                <Text
                  className="text-body-sm text-text-secondary font-semibold"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {pendingVerification.identifier}
                </Text>
              </>
            )}
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
              placeholder={
                pendingVerification.strategy === 'backup_code'
                  ? 'Enter backup code'
                  : 'Enter 6-digit code'
              }
              placeholderTextColor={colors.muted}
              keyboardType={
                pendingVerification.strategy === 'backup_code'
                  ? 'default'
                  : 'number-pad'
              }
              autoCapitalize="none"
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

          {activationFailureContext === 'verification' &&
          pendingSessionActivationId ? (
            <View className="flex-row justify-center mt-3">
              <Button
                variant="secondary"
                size="small"
                label="Try Again"
                onPress={() => void retrySessionActivation()}
                disabled={loading}
                testID="sign-in-retry-activation"
              />
            </View>
          ) : null}

          {pendingVerification.strategy !== 'totp' &&
            pendingVerification.strategy !== 'backup_code' && (
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
            )}

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
          {isReturningUser === null
            ? 'Welcome'
            : isReturningUser
            ? 'Welcome back'
            : 'Welcome to MentoMate'}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-6 text-center">
          {isReturningUser === null
            ? 'Sign in to get started'
            : isReturningUser
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

        {unsupportedVerificationStrategies.length > 0 && (
          <View
            className="bg-surface rounded-card px-4 py-4 mb-4"
            testID="sign-in-unsupported-factor-help"
          >
            <Text className="text-body-sm text-text-secondary">
              {unsupportedHasSSOProviders
                ? "If this account also uses Google or Apple sign-in, try that above. If that doesn't work, contact support."
                : `Contact support and we'll help you sign in. Mention: ${unsupportedVerificationStrategies
                    .map(describeVerificationStrategy)
                    .join(', ')}.`}
            </Text>
            <View className="mt-4">
              <Button
                variant="secondary"
                size="small"
                label="Contact support"
                onPress={() => void onContactSupport()}
                testID="sign-in-contact-support"
              />
            </View>
          </View>
        )}

        {activationFailureContext === 'oauth' && pendingSessionActivationId ? (
          <View className="mb-6">
            <Button
              variant="secondary"
              label="Try Again"
              onPress={() => void retrySessionActivation()}
              disabled={loading || oauthLoading !== null}
              testID="sign-in-oauth-retry"
            />
          </View>
        ) : null}

        {Platform.OS !== 'ios' && (
          <View className="mb-6">
            <Button
              variant="secondary"
              label="Continue with Google"
              onPress={() => onSSOPress('oauth_google')}
              disabled={oauthLoading !== null}
              loading={oauthLoading === 'oauth_google'}
              testID="google-sso-button"
            />
          </View>
        )}

        {Platform.OS === 'ios' && (
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
        )}

        {openAIStrategy ? (
          <View className="mb-6">
            <Button
              variant="secondary"
              label="Continue with OpenAI"
              onPress={() => onSSOPress(openAIStrategy)}
              disabled={oauthLoading !== null}
              loading={oauthLoading === openAIStrategy}
              testID="openai-sso-button"
            />
          </View>
        ) : null}

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
        {/* BUG-414: Explain why button is disabled when fields are empty */}
        {!canSubmit && !loading && (
          <Text
            className="text-body-sm text-text-secondary text-center mt-2"
            testID="sign-in-validation-hint"
          >
            {emailAddress.trim() === ''
              ? 'Enter your email to continue'
              : password === ''
              ? 'Enter your password to continue'
              : ''}
          </Text>
        )}

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
                {'identifier' in verificationOffer
                  ? verificationOffer.identifier
                  : 'your device'}
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
            onPress={() =>
              router.push({
                pathname: '/(auth)/sign-up',
                params: emailAddress.trim()
                  ? { email: emailAddress.trim() }
                  : undefined,
              })
            }
            testID="sign-up-link"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
