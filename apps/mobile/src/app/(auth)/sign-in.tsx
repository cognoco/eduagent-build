import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { useSSO, useClerk } from '@clerk/expo';
import { useSignIn } from '@clerk/expo/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { GATE_WEB_MAX_WIDTH, PasswordInput } from '../../components/common';
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
import {
  clearSessionExpiredNotice,
  clearSessionRevokedNotice,
  peekSessionExpiredNotice,
  peekSessionRevokedNotice,
} from '../../lib/auth-expiry';
import {
  readWebSearchParam,
  toInternalAppRedirectPath,
} from '../../lib/normalize-redirect-path';
import {
  clearPendingAuthRedirect,
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';
import { ErrorFallback } from '../../components/common/ErrorFallback';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { getPostAuthDefaultPath } from '../(app)/_lib/auth-redirect';

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
      ((f as Record<string, unknown>).strategy as string).startsWith('oauth_'),
  );
}

function describeVerificationStrategy(strategy: string, t: TFunction): string {
  switch (strategy) {
    case 'webauthn':
      return t('auth.signIn.strategyWebauthn');
    case 'totp':
      return t('auth.signIn.strategyTotp');
    case 'phone_code':
      return t('auth.signIn.strategyPhoneCode');
    case 'email_code':
      return t('auth.signIn.strategyEmailCode');
    default:
      return strategy.replace(/_/g, ' ');
  }
}

function formatUnsupportedVerificationMessage(
  strategies: string[],
  t: TFunction,
): string {
  if (strategies.length === 0) {
    return t('auth.signIn.unsupportedMethodGeneric');
  }

  const [first] = strategies;
  if (strategies.length === 1 && first) {
    return t('auth.signIn.unsupportedMethodSingle', {
      method: describeVerificationStrategy(first, t),
    });
  }

  const described = strategies.map((s) => describeVerificationStrategy(s, t));
  const last = described.pop();
  return t('auth.signIn.unsupportedMethodMultiple', {
    methods: described.join(', '),
    last,
  });
}

export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signOut: clerkSignOut, isSignedIn: isClerkSignedIn } = useClerk();
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
    peekPendingAuthRedirect() ?? getPostAuthDefaultPath(),
  );
  const requestedRedirectRef = useRef(
    localRedirectTarget || browserRedirectTarget
      ? rememberPendingAuthRedirect(requestedRedirectTarget)
      : requestedRedirectTarget,
  );

  if (localRedirectTarget || browserRedirectTarget) {
    requestedRedirectRef.current = rememberPendingAuthRedirect(
      requestedRedirectTarget,
    );
  }

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // [BUG-780] Discriminator for the forced-signout banner shown at mount.
  // `expired` is set by markSessionExpired() (client-side 401 / token expiry);
  // `revoked` is set by markSessionRevoked() (server-side session revoke).
  // `null` means the current `error` text is from a user-triggered failure,
  // not a forced sign-out, and the standard error testID applies.
  const [forcedSignOutReason, setForcedSignOutReason] = useState<
    'expired' | 'revoked' | null
  >(null);
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
    isWithinTransitionWindow,
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
      SESSION_TRANSITION_MS - getTransitionElapsed(),
    );
    // Phase 1: SESSION_TRANSITION_MS elapsed → show ErrorFallback ("stuck")
    const phase1 = setTimeout(() => {
      if (__DEV__)
        console.warn(
          `[AUTH-DEBUG] transitioning phase-1 TIMEOUT after ${SESSION_TRANSITION_MS}ms — showing stuck fallback`,
        );
      setTransitionStuck(true);
    }, remaining);
    // Phase 2: 15s after phase 1 → give up entirely and reset to sign-in form
    const phase2 = setTimeout(() => {
      if (__DEV__)
        console.warn(
          '[AUTH-DEBUG] transitioning phase-2 TIMEOUT — falling back to sign-in form',
        );
      clearTransitionState();
      setTransitionStuck(false);
      setIsTransitioning(false);
      setError(t('auth.signIn.transitionTimeout'));
    }, remaining + 15_000);
    return () => {
      clearTimeout(phase1);
      clearTimeout(phase2);
    };
  }, [isTransitioning]);

  const { startSSOFlow } = useSSO();
  const openAIStrategy = getOpenAISSOStrategy();

  // Recovery for stuck OAuth spinner: on Android, dismissing the Chrome
  // Custom Tab via swipe/back gesture sometimes leaves Clerk's startSSOFlow
  // promise unresolved, so the `finally` that clears `oauthLoading` never
  // runs and the SSO button is permanently stuck. When the app returns to
  // foreground while a SSO flow is loading, give Clerk a short grace window
  // to resolve naturally (success path runs setActive within ms); if the
  // spinner is still set after that, force-clear it so the button is
  // tappable again.
  useEffect(() => {
    if (oauthLoading === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // [CR-116] AppState callback fires asynchronously; the 1.5s deferral
        // means the screen may have unmounted before this runs. The cleanup
        // below clears the timer on unmount, but a synchronous unmount-then-
        // fire race is still possible. Guard before touching state.
        if (isMountedRef.current) setOauthLoading(null);
      }, 1500);
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [oauthLoading]);

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
    [setError],
  );

  const clearSessionExpiredMessage = useCallback(() => {
    clearSessionExpiredNotice();
    clearSessionRevokedNotice();
    setError('');
    setForcedSignOutReason(null);
  }, []);

  useEffect(() => {
    // [BUG-780] Revoked takes precedence over expired when both are set —
    // a server-side revoke is a stronger signal than a client-side expiry,
    // and the banners are mutually exclusive at the UI layer.
    if (peekSessionRevokedNotice()) {
      clearVerificationFlow();
      setForcedSignOutReason('revoked');
      setError(t('auth.signIn.sessionRevoked'));
      return;
    }
    if (peekSessionExpiredNotice()) {
      clearVerificationFlow();
      setForcedSignOutReason('expired');
      setError(t('auth.signIn.sessionExpired'));
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
    [emailAddress],
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
    [signIn],
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
          }`,
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
        setError(t('auth.signIn.needsNewPassword'));
        return;
      }

      if (
        attempt.status === 'needs_first_factor' ||
        attempt.status === 'needs_second_factor'
      ) {
        const unsupportedStrategies = getFactorStrategies(
          attempt.status === 'needs_first_factor'
            ? attempt.supportedFirstFactors
            : attempt.supportedSecondFactors,
        );
        const ssoAvailable = hasSSOProviders(attempt.supportedFirstFactors);
        setUnsupportedVerificationStrategies(unsupportedStrategies);
        setUnsupportedHasSSOProviders(ssoAvailable);
        setError(
          formatUnsupportedVerificationMessage(unsupportedStrategies, t),
        );
        return;
      }

      setError(t('auth.signIn.signInNotCompleted'));
    },
    [clearVerificationFlow, getVerificationStep, startVerificationFlow, t],
  );

  const onContactSupport = useCallback(async () => {
    const describedMethods =
      unsupportedVerificationStrategies.length > 0
        ? unsupportedVerificationStrategies
            .map((s) => describeVerificationStrategy(s, t))
            .join(', ')
        : 'an unsupported verification method';

    try {
      await Linking.openURL(
        `mailto:support@mentomate.app?subject=${encodeURIComponent(
          'Unsupported sign-in verification',
        )}&body=${encodeURIComponent(
          `Hi, I need help signing in on mobile because my account requires ${describedMethods}.`,
        )}`,
      );
    } catch {
      setError(
        t('auth.signIn.contactSupportEmailError', {
          methods: describedMethods,
        }),
      );
    }
  }, [unsupportedVerificationStrategies, t]);

  const activateSession = useCallback(
    async (
      sessionId: string | null,
      context: 'oauth' | 'password' | 'verification',
    ): Promise<boolean> => {
      if (!isMountedRef.current) return false;
      if (!sessionId) {
        setError(t('auth.signIn.noSessionCreated'));
        return false;
      }
      if (!setActive) {
        setError(t('auth.signIn.authNotLoaded'));
        return false;
      }

      try {
        rememberPendingAuthRedirect(requestedRedirectRef.current);
        if (__DEV__)
          console.log(
            `[AUTH-DEBUG] activateSession → calling setActive(${sessionId}) context=${context}`,
          );
        await setActive({ session: sessionId });
        if (__DEV__)
          console.log('[AUTH-DEBUG] activateSession → setActive resolved OK');
      } catch (e) {
        if (__DEV__)
          console.warn('[AUTH-DEBUG] activateSession → setActive THREW', e);
        setPendingSessionActivationId(sessionId);
        setActivationFailureContext(context);
        setError(t('auth.signIn.activationFailed'));
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
      // Don't navigate explicitly — the auth layout guard redirects once
      // Clerk's useAuth() state propagates with isSignedIn: true.
      // Calling router.replace() here races with Clerk's
      // React state update: the app layout renders before isSignedIn
      // flips, sees !isSignedIn, and bounces back to sign-in.
      return true;
    },
    [setActive],
  );

  const onSSOPress = useCallback(
    async (strategy: SupportedSSOStrategy) => {
      if (!isLoaded) return;
      clearVerificationFlow();
      clearSessionExpiredMessage();
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

        // User dismissed the in-app browser without completing OAuth — treat
        // as a silent cancel rather than surfacing "could not complete".
        const authSessionType = (
          ssoResult as { authSessionResult?: { type?: string } }
        ).authSessionResult?.type;
        if (authSessionType && authSessionType !== 'success') {
          if (__DEV__)
            console.log(
              `[AUTH-DEBUG] SSO cancelled by user: type=${authSessionType}`,
            );
          return;
        }

        if (__DEV__)
          console.log(
            `[AUTH-DEBUG] SSO result → createdSessionId=${
              createdSessionId ?? 'null'
            }` +
              ` | signIn.status=${ssoSignIn?.status ?? 'null'}` +
              ` | signUp.status=${ssoSignUp?.status ?? 'null'}` +
              ` | signUp.createdSessionId=${
                ssoSignUp?.createdSessionId ?? 'null'
              }`,
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
                  (f: Record<string, unknown>) => f.strategy,
                ),
              ),
            );
          await handleIncompleteSignIn(ssoSignIn);
          return;
        }

        if (ssoSignUp?.status && ssoSignUp.status !== 'complete') {
          if (__DEV__)
            console.warn(
              `[AUTH-DEBUG] SSO signUp incomplete: status=${ssoSignUp.status}` +
                ` | missingFields=${JSON.stringify(
                  ssoSignUp.missingFields ?? [],
                )}`,
            );
          setError(
            t('auth.signIn.ssoSignUpIncomplete', {
              provider: strategy === 'oauth_google' ? 'Google' : 'SSO',
            }),
          );
          return;
        }

        setError(t('auth.signIn.signInNotCompleted'));
      } catch (err: unknown) {
        if (__DEV__) console.warn('[AUTH-DEBUG] SSO flow threw:', err);
        setError(extractClerkError(err));
      } finally {
        if (isMountedRef.current) setOauthLoading(null);
      }
    },
    [
      activateSession,
      clearSessionExpiredMessage,
      clearVerificationFlow,
      handleIncompleteSignIn,
      isMountedRef,
      isLoaded,
      startSSOFlow,
    ],
  );

  const retrySessionActivation = useCallback(async () => {
    if (!isMountedRef.current) return;
    if (!pendingSessionActivationId || !activationFailureContext) {
      return;
    }
    if (!isLoaded || !setActive) {
      setError(t('auth.signIn.authNotReady'));
      return;
    }

    clearSessionExpiredMessage();
    setLoading(true);
    try {
      await activateSession(
        pendingSessionActivationId,
        activationFailureContext,
      );
    } finally {
      setLoading(false);
    }
  }, [
    activateSession,
    activationFailureContext,
    clearSessionExpiredMessage,
    isLoaded,
    pendingSessionActivationId,
    setActive,
  ]);

  // [CR-2026-05-21-111] Cancel an in-progress (failed-activation) SSO attempt.
  // Without this the persisted redirect from rememberPendingAuthRedirect and
  // the pendingSessionActivationId / activationFailureContext state survive a
  // provider swap — the user could tap "Continue with Apple" after a failed
  // Google activation and be sent back to the stale Google redirect target
  // once Apple completes. Clearing all three returns the screen to a clean
  // first-attempt state.
  const cancelPendingSSOActivation = useCallback(() => {
    setPendingSessionActivationId(null);
    setActivationFailureContext(null);
    clearPendingAuthRedirect();
    requestedRedirectRef.current = '/(app)/home';
    setError('');
  }, []);

  const onSignInPress = useCallback(async () => {
    if (!isLoaded || !canSubmit || !signIn) return;

    clearVerificationFlow();
    clearSessionExpiredMessage();
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
              (f: Record<string, unknown>) => f.strategy,
            ),
          )}`,
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
    clearSessionExpiredMessage,
    clearVerificationFlow,
    handleIncompleteSignIn,
    emailAddress,
    password,
    router,
  ]);

  const onStartVerificationPress = useCallback(async () => {
    if (!isLoaded || !verificationOffer) return;

    clearSessionExpiredMessage();
    setLoading(true);

    try {
      await startVerificationFlow(verificationOffer);
    } catch (err: unknown) {
      setError(
        extractClerkError(
          err,
          'We could not start verification. Please try signing in again.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [
    clearSessionExpiredMessage,
    isLoaded,
    startVerificationFlow,
    verificationOffer,
  ]);

  const onVerifyPress = useCallback(async () => {
    if (!isLoaded || !signIn || !pendingVerification || code.trim() === '')
      return;

    clearSessionExpiredMessage();
    setLoading(true);

    try {
      if (__DEV__)
        console.log(
          `[AUTH-DEBUG] onVerifyPress → attempting ${pendingVerification.stage} / ${pendingVerification.strategy}`,
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
          } | sessionId=${result.createdSessionId ?? 'null'}`,
        );

      if (result.status === 'complete') {
        await activateSession(result.createdSessionId, 'verification');
      } else {
        if (__DEV__)
          console.warn(
            `[AUTH-DEBUG] onVerifyPress → NOT complete, calling handleIncompleteSignIn`,
          );
        await handleIncompleteSignIn(result);
      }
    } catch (err: unknown) {
      if (__DEV__) console.warn('[AUTH-DEBUG] onVerifyPress → THREW', err);
      setError(
        extractClerkError(err, 'Invalid verification code. Please try again.'),
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
    clearSessionExpiredMessage,
    handleIncompleteSignIn,
  ]);

  const onResendCode = useCallback(async () => {
    if (!isLoaded || !signIn || !pendingVerification || resending) return;
    if (pendingVerification.strategy === 'backup_code') return;

    clearSessionExpiredMessage();
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
  }, [
    clearSessionExpiredMessage,
    isLoaded,
    pendingVerification,
    resending,
    signIn,
  ]);

  const onBackFromVerification = useCallback(() => {
    clearVerificationFlow(true);
  }, [clearVerificationFlow]);

  // After setActive() succeeds, show a spinner until the auth layout guard
  // redirects. This prevents the user from ever seeing
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
            title={t('auth.signIn.stuckTitle')}
            message={t('auth.signIn.stuckMessage')}
            primaryAction={{
              label: t('common.tryAgainAction'),
              testID: 'sign-in-stuck-retry',
              onPress: () => {
                // [#509] Sign out Clerk's in-memory session before resetting
                // form state. Without this, Clerk holds the active session and
                // re-submitting credentials can silently re-trigger the
                // transition or fail with "session exists". If isSignedIn is
                // still true after signOut (race), redirect to the current
                // signed-in default instead.
                void clerkSignOut()
                  .catch(() => {
                    /* signOut failure is non-fatal here — still reset form */
                  })
                  .finally(() => {
                    if (isClerkSignedIn) {
                      router.replace(getPostAuthDefaultPath());
                      return;
                    }
                    clearTransitionState();
                    setTransitionStuck(false);
                    setIsTransitioning(false);
                  });
              },
            }}
            secondaryAction={{
              label: t('auth.signIn.signUpLabel'),
              testID: 'sign-in-stuck-signup',
              onPress: () => {
                void clerkSignOut()
                  .catch(() => {
                    /* non-fatal */
                  })
                  .finally(() => {
                    clearTransitionState();
                    setTransitionStuck(false);
                    setIsTransitioning(false);
                    router.replace('/(auth)/sign-up');
                  });
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
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('auth.signIn.signingYouIn')}
        />
        <Text className="text-body text-text-secondary mt-4">
          {t('auth.signIn.signingYouIn')}
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
          style={{
            width: '100%',
            ...(Platform.OS === 'web'
              ? { maxWidth: GATE_WEB_MAX_WIDTH }
              : undefined),
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
            {pendingVerification.strategy === 'totp'
              ? t('auth.signIn.enterAuthenticatorCode')
              : pendingVerification.strategy === 'backup_code'
                ? t('auth.signIn.enterBackupCode')
                : t('auth.signIn.enterVerificationCode')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-6">
            {pendingVerification.strategy === 'totp' ? (
              t('auth.signIn.totpHint')
            ) : pendingVerification.strategy === 'backup_code' ? (
              t('auth.signIn.backupCodeHint')
            ) : (
              <Trans
                i18nKey="auth.signIn.sentCodeTo"
                values={{ email: pendingVerification.identifier }}
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
              {t('auth.signIn.verificationCodeLabel')}
            </Text>
            <TextInput
              className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
              placeholder={
                pendingVerification.strategy === 'backup_code'
                  ? t('auth.signIn.enterBackupCodePlaceholder')
                  : t('auth.signIn.enterSixDigitCodePlaceholder')
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
            label={t('auth.signIn.verifyButton')}
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
                label={t('common.tryAgain')}
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
                  label={t('auth.signIn.resendCode')}
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
              label={t('auth.signIn.backToSignIn')}
              onPress={onBackFromVerification}
              testID="sign-in-back-from-verify"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <View className="flex-1 items-center w-full" testID="sign-in-screen">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          style={{
            width: '100%',
            ...(Platform.OS === 'web'
              ? { maxWidth: GATE_WEB_MAX_WIDTH }
              : undefined),
          }}
          contentContainerStyle={{
            minHeight: SCREEN_HEIGHT,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          testID="sign-in-scroll"
        >
          <View testID="sign-in-content">
            <View className="items-center mt-2 mb-1">
              <MentomateLogo size="sm" />
            </View>
            <Text
              className="text-h2 font-bold text-text-primary mb-1 text-center"
              testID={
                isReturningUser === null
                  ? 'sign-in-welcome-loading'
                  : isReturningUser
                    ? 'sign-in-welcome-returning'
                    : 'sign-in-welcome-first-time'
              }
            >
              {isReturningUser === null
                ? t('auth.signIn.welcome')
                : isReturningUser
                  ? t('auth.signIn.welcomeReturning')
                  : t('auth.signIn.welcomeFirstTime')}
            </Text>
            <Text
              className="text-body-sm text-text-secondary mb-2 text-center"
              testID={
                isReturningUser === null
                  ? 'sign-in-subtitle-loading'
                  : isReturningUser
                    ? 'sign-in-subtitle-returning'
                    : 'sign-in-subtitle-first-time'
              }
            >
              {isReturningUser === null
                ? t('auth.signIn.subtitleLoading')
                : isReturningUser
                  ? t('auth.signIn.subtitleReturning')
                  : t('auth.signIn.subtitleFirstTime')}
            </Text>

            {error !== '' && (
              <View
                className="bg-danger/10 rounded-card px-4 py-3 mb-4"
                accessibilityRole="alert"
                // [BUG-779/780] Discriminated testID lets the mentor-audit
                // smoke + tests assert which forced-signout cause produced
                // the banner without depending on copy strings. Falls back
                // to a generic sign-in-error testID for user-triggered
                // failures (wrong password, network, etc.) so existing
                // tests that look for the banner generically still pass.
                testID={
                  forcedSignOutReason === 'expired'
                    ? 'session-expired-banner'
                    : forcedSignOutReason === 'revoked'
                      ? 'session-revoked-banner'
                      : 'sign-in-error'
                }
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
                    ? t('auth.signIn.unsupportedSsoHint')
                    : t('auth.signIn.unsupportedContactHint', {
                        methods: unsupportedVerificationStrategies
                          .map((s) => describeVerificationStrategy(s, t))
                          .join(', '),
                      })}
                </Text>
                <View className="mt-4">
                  <Button
                    variant="secondary"
                    size="small"
                    label={t('auth.signIn.contactSupport')}
                    onPress={() => void onContactSupport()}
                    testID="sign-in-contact-support"
                  />
                </View>
              </View>
            )}

            {activationFailureContext === 'oauth' &&
            pendingSessionActivationId ? (
              <View className="mb-6">
                <Button
                  variant="secondary"
                  label={t('common.tryAgain')}
                  onPress={() => void retrySessionActivation()}
                  disabled={loading || oauthLoading !== null}
                  testID="sign-in-oauth-retry"
                />
                {/* [CR-2026-05-21-111] Cancel sign-in: without this the user
                    is stuck — a different OAuth provider tap reuses the
                    persisted redirect from rememberPendingAuthRedirect and
                    leaves pendingSessionActivationId pointing at the failed
                    session. Cancel clears both so the next sign-in attempt
                    starts from a clean slate. */}
                <View className="mt-2">
                  <Button
                    variant="tertiary"
                    size="small"
                    label={t('auth.signIn.cancelSignIn')}
                    onPress={cancelPendingSSOActivation}
                    disabled={loading}
                    testID="sign-in-oauth-cancel"
                  />
                </View>
              </View>
            ) : null}

            {Platform.OS !== 'ios' && (
              <View className="mb-2">
                <Button
                  variant="secondary"
                  label={t('auth.signIn.continueWithGoogle')}
                  onPress={() => onSSOPress('oauth_google')}
                  disabled={oauthLoading !== null}
                  loading={oauthLoading === 'oauth_google'}
                  testID="google-sso-button"
                />
              </View>
            )}

            {Platform.OS === 'ios' && (
              <View className="mb-2">
                <Button
                  variant="secondary"
                  label={t('auth.signIn.continueWithApple')}
                  onPress={() => onSSOPress('oauth_apple')}
                  disabled={oauthLoading !== null}
                  loading={oauthLoading === 'oauth_apple'}
                  testID="apple-sso-button"
                />
              </View>
            )}

            {openAIStrategy ? (
              <View className="mb-2">
                <Button
                  variant="secondary"
                  label={t('auth.signIn.continueWithOpenAI')}
                  onPress={() => onSSOPress(openAIStrategy)}
                  disabled={oauthLoading !== null}
                  loading={oauthLoading === openAIStrategy}
                  testID="openai-sso-button"
                />
              </View>
            ) : null}

            <View className="flex-row items-center mb-2">
              <View className="flex-1 h-px bg-border" />
              <Text className="text-body-sm text-text-secondary mx-4">
                {t('common.or')}
              </Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            <View onLayout={onFieldLayout('email')}>
              <Text className="text-body-sm font-semibold text-text-secondary mb-1">
                {t('auth.signIn.emailLabel')}
              </Text>
              <TextInput
                className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-2"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder={t('auth.signIn.emailPlaceholder')}
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
                {t('auth.signIn.passwordLabel')}
              </Text>
              <View className="mb-2">
                <PasswordInput
                  value={password}
                  onChangeText={(value) => {
                    clearVerificationFlow(true);
                    setPassword(value);
                  }}
                  placeholder={t('auth.signIn.passwordPlaceholder')}
                  editable={!loading}
                  testID="sign-in-password"
                  onSubmitEditing={onSignInPress}
                  onFocus={onFieldFocus('password')}
                />
              </View>
            </View>

            <View className="items-end mb-2">
              <Button
                variant="tertiary"
                size="small"
                label={t('auth.signIn.forgotPassword')}
                onPress={() => router.push('/(auth)/forgot-password')}
                testID="forgot-password-link"
              />
            </View>

            <Button
              variant="primary"
              label={t('auth.signIn.signInButton')}
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
                  ? t('auth.signIn.enterEmailHint')
                  : password === ''
                    ? t('auth.signIn.enterPasswordHint')
                    : ''}
              </Text>
            )}

            {verificationOffer && (
              <View
                className="bg-primary/10 rounded-card px-4 py-4 mt-4"
                testID="sign-in-verification-offer"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('auth.signIn.additionalVerificationTitle')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-2">
                  <Trans
                    i18nKey="auth.signIn.offerBody"
                    values={{
                      identifier:
                        'identifier' in verificationOffer
                          ? verificationOffer.identifier
                          : t('auth.signIn.yourDevice'),
                    }}
                    components={{
                      id: <Text className="font-semibold text-text-primary" />,
                    }}
                  />
                </Text>
                <View className="mt-4">
                  <Button
                    variant="secondary"
                    label={t('auth.signIn.sendVerificationCode')}
                    onPress={onStartVerificationPress}
                    disabled={loading}
                    loading={loading}
                    testID="sign-in-start-verification"
                  />
                </View>
              </View>
            )}

            <View className="flex-row justify-center items-center mt-4">
              <Text className="text-body-sm text-text-secondary">
                {t('auth.signIn.noAccountPrompt')}{' '}
              </Text>
              <Button
                variant="tertiary"
                size="small"
                label={t('auth.signIn.signUpLabel')}
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

            {FEATURE_FLAGS.PREVIEW_ONBOARDING_ENABLED &&
              FEATURE_FLAGS.PREVIEW_ENTRY_CTA_ENABLED && (
                <View className="w-full mt-6 pt-6 border-t border-border">
                  <Text className="text-body-sm text-text-secondary text-center mb-3">
                    {t('auth.signIn.newHere')}
                  </Text>
                  <Pressable
                    onPress={() => router.push('/preview')}
                    className="bg-surface rounded-button py-3.5 px-8 items-center w-full"
                    testID="try-mentomate-cta"
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.signIn.tryMentomate')}
                  >
                    <Text className="text-body font-semibold text-primary">
                      {t('auth.signIn.tryMentomate')}
                    </Text>
                  </Pressable>
                </View>
              )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
