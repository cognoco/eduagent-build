import React from 'react';
import { Tabs, Redirect, usePathname, useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk, useUser } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from '../../lib/secure-storage';
import { useProfile, personaFromBirthYear } from '../../lib/profile';
import { useThemeColors, useTokenVars } from '../../lib/theme';
import { useConsentStatus, useRequestConsent } from '../../hooks/use-consent';
import { usePushTokenRegistration } from '../../hooks/use-push-token-registration';
import { useRevenueCatIdentity } from '../../hooks/use-revenuecat';
import {
  getConsentPendingCopy,
  getConsentWithdrawnCopy,
} from '../../lib/consent-copy';
import { evaluateSentryForProfile } from '../../lib/sentry';
import { formatApiError } from '../../lib/format-api-error';
import { clearTransitionState } from '../../lib/auth-transition';
import { toInternalAppRedirectPath } from '../../lib/normalize-redirect-path';
import {
  clearPendingAuthRedirect,
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';
import { platformAlert } from '../../lib/platform-alert';
import { FeedbackProvider } from '../../components/feedback/FeedbackProvider';
import { ErrorFallback } from '../../components/common';
import { goBackOrReplace } from '../../lib/navigation';
import { useSubjects } from '../../hooks/use-subjects';
import { usePermissionSetup } from '../../hooks/use-permission-setup';
import { PermissionSetupGate } from '../../components/PermissionSetupGate';
import { useParentProxy } from '../../hooks/use-parent-proxy';

// ─── Tab visibility whitelist ────────────────────────────────────────
// Only these routes render a visible tab button. Every other route in
// (app)/ is auto-hidden — no manual Tabs.Screen entry required.
const VISIBLE_TABS = new Set(['home', 'library', 'progress', 'more']);

// Routes where the entire tab bar is hidden (immersive / full-screen UX).
const FULL_SCREEN_ROUTES = new Set([
  'onboarding',
  'session',
  'homework',
  'dictation',
  'quiz',
  'shelf',
  'shelf/[subjectId]',
  'shelf/[subjectId]/book/[bookId]',
]);

const PENDING_AUTH_REDIRECT_SETTLE_MS = 1_000;

const iconMap: Record<
  string,
  {
    focused: keyof typeof Ionicons.glyphMap;
    default: keyof typeof Ionicons.glyphMap;
  }
> = {
  Home: { focused: 'home', default: 'home-outline' },
  Book: { focused: 'book', default: 'book-outline' },
  Progress: { focused: 'stats-chart', default: 'stats-chart-outline' },
  More: { focused: 'menu', default: 'menu-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const colors = useThemeColors();
  const entry = iconMap[name];
  return (
    <Ionicons
      name={
        entry ? (focused ? entry.focused : entry.default) : 'ellipse-outline'
      }
      size={22}
      color={focused ? colors.accent : colors.textSecondary}
    />
  );
}

function ProxyBanner({
  childName,
  onSwitchBack,
}: {
  childName: string;
  onSwitchBack: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-center justify-between px-4 bg-surface-elevated border-b border-border"
      style={{
        paddingTop: insets.top,
        height: 44 + insets.top,
      }}
      testID="proxy-banner"
    >
      <View className="flex-row items-center flex-1">
        <Ionicons
          name="eye-outline"
          size={16}
          color={colors.textSecondary}
          style={{ marginRight: 6 }}
        />
        <Text
          className="text-body-sm text-text-secondary flex-1"
          numberOfLines={1}
        >
          Viewing {childName}&apos;s account
        </Text>
      </View>
      <Pressable
        onPress={onSwitchBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Switch back to your account"
        testID="proxy-banner-switch-back"
      >
        <Text className="text-body-sm font-semibold text-primary">
          Switch back
        </Text>
      </Pressable>
    </View>
  );
}

/** Consent statuses that block app access */
const PENDING_CONSENT_STATUSES = new Set([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
]);

function resolveAuthRedirectPath(pathname: string | undefined): string {
  if (Platform.OS === 'web') {
    // Access window via globalThis to avoid TS DOM-lib requirement in RN tsconfig.
    const win = (
      globalThis as { window?: { location?: { pathname?: string } } }
    ).window;
    if (typeof win?.location?.pathname === 'string') {
      return toInternalAppRedirectPath(win.location.pathname);
    }
  }

  return toInternalAppRedirectPath(pathname);
}

/**
 * Whether the "Switch profile" button should appear inside consent gates.
 *
 * Rules (consent-bypass fix):
 * - Hidden for anyone under 18 — prevents children from escaping the gate
 *   by switching to an un-gated profile.
 * - Hidden for adults (18+) with no linked minor profiles — no legitimate
 *   reason to switch from a consent gate.
 * - Shown ONLY for adults (18+) who share the account with at least one minor
 *   profile (proxy for family links), so a parent viewing their child's
 *   pending/withdrawn consent screen can switch back to their own profile.
 */
function canSwitchFromConsentGate(
  activeProfile: { id: string; birthYear: number } | null,
  profiles: ReadonlyArray<{ id: string; birthYear: number }>
): boolean {
  if (!activeProfile) return false;
  const currentYear = new Date().getFullYear();
  const age = currentYear - activeProfile.birthYear;
  if (age < 18) return false;
  // Must have at least one OTHER profile that belongs to a minor
  return profiles.some(
    (p) => p.id !== activeProfile.id && currentYear - p.birthYear < 18
  );
}

/**
 * Checks whether the post-approval landing screen should be shown.
 * Returns [shouldShow, dismiss] — call dismiss() when user taps "Let's Go".
 */
function usePostApprovalLanding(
  profileId: string | undefined,
  consentStatus: string | null | undefined
): [boolean, () => void] {
  const isConsented = !!profileId && consentStatus === 'CONSENTED';
  const [shouldShow, setShouldShow] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  // [IMP-2] Only query subjects once we know the screen should show — avoids
  // an unnecessary network request (and loading delay) for users whose SecureStore
  // key is already set to 'true'. For new users, the query fires after the
  // SecureStore async read completes.
  const subjects = useSubjects({
    enabled: isConsented && checked && shouldShow,
  });

  React.useEffect(() => {
    if (!profileId || consentStatus !== 'CONSENTED') {
      setChecked(true);
      return;
    }

    const key = `postApprovalSeen_${profileId}`;
    (async () => {
      try {
        const value = await SecureStore.getItemAsync(key);
        setShouldShow(value !== 'true');
        setChecked(true);
      } catch {
        setChecked(true);
      }
    })();
  }, [profileId, consentStatus]);

  const dismiss = React.useCallback(() => {
    if (!profileId) return;
    setShouldShow(false);
    const key = `postApprovalSeen_${profileId}`;
    void SecureStore.setItemAsync(key, 'true').catch(() => {
      /* non-fatal */
    });
  }, [profileId]);

  // Don't show if subjects are still loading or if user already has subjects
  const subjectsReady = !subjects.isLoading;
  const hasSubjects = (subjects.data?.length ?? 0) > 0;
  return [checked && subjectsReady && shouldShow && !hasSubjects, dismiss];
}

function PostApprovalLanding({
  onContinue,
}: {
  onContinue: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="post-approval-landing"
    >
      <Text className="text-4xl mb-6" accessibilityLabel="Celebration">
        {'\u{1F389}'}
      </Text>
      <Text
        className="text-h1 font-bold text-text-primary mb-4 text-center"
        accessibilityRole="header"
      >
        You're approved!
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        Your parent said yes — time to start learning.
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        Let's set up your first subject.
      </Text>

      <Pressable
        onPress={onContinue}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full"
        testID="post-approval-continue"
        accessibilityRole="button"
        accessibilityLabel="Let's Go"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Let's Go
        </Text>
      </Pressable>
    </View>
  );
}

/** Static preview subjects for consent pending preview mode */
const PREVIEW_SUBJECTS = [
  { name: 'Mathematics', topics: ['Algebra', 'Geometry', 'Statistics'] },
  { name: 'Science', topics: ['Physics', 'Chemistry', 'Biology'] },
  { name: 'Languages', topics: ['Grammar', 'Vocabulary', 'Conversation'] },
  { name: 'History', topics: ['Modern History', 'World History', 'Civics'] },
];

function PreviewSubjectBrowser({
  onDismiss,
}: {
  onDismiss: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="preview-subject-browser"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={onDismiss}
          className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
          accessibilityLabel="Back to waiting screen"
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">Back</Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          Browse Subjects
        </Text>
      </View>
      <Text className="text-body-sm text-text-secondary px-5 mb-4">
        Here's a preview of what you can learn. You'll unlock these once your
        parent approves.
      </Text>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {PREVIEW_SUBJECTS.map((subject) => (
          <View
            key={subject.name}
            className="bg-surface rounded-card px-4 py-3.5 mb-3"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              {subject.name}
            </Text>
            {subject.topics.map((topic) => (
              <View key={topic} className="flex-row items-center mb-1">
                <View
                  className="w-2 h-2 rounded-full me-2"
                  style={{ backgroundColor: colors.muted }}
                />
                <Text className="text-body-sm text-text-secondary">
                  {topic}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function PreviewSampleCoaching({
  onDismiss,
}: {
  onDismiss: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="preview-sample-coaching"
    >
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={onDismiss}
          className="me-3 min-w-[44px] min-h-[44px] justify-center items-center"
          accessibilityLabel="Back to waiting screen"
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">Back</Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          How It Works
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="bg-coaching-card rounded-card p-5 mt-4">
          <Text className="text-h3 font-semibold text-text-primary mb-2">
            Ready for homework?
          </Text>
          <Text className="text-body text-text-secondary mb-4">
            Your mentor will know what you need each day — whether it's homework
            help, practice, or a quick review.
          </Text>
          <View className="bg-surface rounded-button py-3 px-4 mb-2 items-center">
            <Text className="text-body font-semibold text-primary">
              Homework help
            </Text>
          </View>
          <View className="bg-surface rounded-button py-3 px-4 mb-2 items-center">
            <Text className="text-body font-semibold text-primary">
              Practice for a test
            </Text>
          </View>
        </View>

        <View className="bg-surface rounded-card p-4 mt-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            How your mentor helps
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            Your AI mentor guides you through problems step by step — never
            gives away the answer. You learn by thinking, not copying.
          </Text>
          <View className="flex-row items-start mb-2">
            <Text className="text-body me-2">{'\u{1F4F7}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              Snap a photo of your homework to get started
            </Text>
          </View>
          <View className="flex-row items-start mb-2">
            <Text className="text-body me-2">{'\u{1F9E0}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              Your mentor remembers what you've learned
            </Text>
          </View>
          <View className="flex-row items-start">
            <Text className="text-body me-2">{'\u{1F4C8}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              Track your progress and retention over time
            </Text>
          </View>
        </View>

        <Text className="text-caption text-text-muted text-center mt-6">
          This is a preview. Full access unlocks after parent approval.
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * Gate shown when no profile exists yet (first-time user after sign-up).
 * Pushes to /create-profile as a modal so router.back() returns here
 * and the layout re-evaluates the guard with the newly created profile.
 */
function CreateProfileGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useClerk();
  const isPushingRef = React.useRef(false);

  const handleSignOut = async () => {
    try {
      clearTransitionState();
      await signOut();
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert('Sign Out Failed', 'Please try again or restart the app.');
    }
  };

  const handleGetStarted = React.useCallback(() => {
    if (isPushingRef.current) return;
    isPushingRef.current = true;
    router.push('/create-profile');
    // Reset after navigation settles to allow re-entry if user backs out
    setTimeout(() => {
      isPushingRef.current = false;
    }, 1000);
  }, [router]);

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="create-profile-gate"
    >
      <Text className="text-h1 font-bold text-text-primary mb-3 text-center">
        Welcome!
      </Text>
      <Text className="text-body text-text-secondary text-center mb-8">
        Let's set up your profile so your mentor can get to know you.
      </Text>
      <Pressable
        onPress={handleGetStarted}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full"
        style={{ minHeight: 48 }}
        testID="create-profile-cta"
        accessibilityRole="button"
        accessibilityLabel="Get started"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Get started
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void handleSignOut()}
        className="mt-6 py-2"
        testID="create-profile-gate-signout"
        accessibilityRole="button"
        accessibilityLabel="Sign out and use a different account"
      >
        <Text className="text-caption text-text-muted text-center underline">
          Sign out
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Gate shown when a parent has withdrawn consent.
 * Child's access is fully blocked during the 7-day deletion grace period.
 * Different messaging from ConsentPendingGate — this is about account deletion.
 */
function ConsentWithdrawnGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleSignOut = async () => {
    try {
      clearTransitionState();
      await signOut();
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert('Sign Out Failed', 'Please try again or restart the app.');
    }
  };

  // BUG-114: Allow child to re-check consent status (e.g. parent cancelled deletion)
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['consent-status'] });
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } finally {
      setRefreshing(false);
    }
  };

  const { profiles, activeProfile, switchProfile } = useProfile();
  const persona = personaFromBirthYear(activeProfile?.birthYear);
  const copy = getConsentWithdrawnCopy(persona);

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="consent-withdrawn-gate"
    >
      <Text
        className="text-h1 font-bold text-text-primary mb-4 text-center"
        accessibilityRole="header"
      >
        {copy.title}
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        {copy.message}
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        {copy.details}
      </Text>
      <Text className="text-body-sm text-text-muted mb-8 text-center">
        {copy.help}
      </Text>

      {/* BUG-114: Refresh button so child can re-check if consent was restored */}
      <Pressable
        onPress={() => void handleRefresh()}
        disabled={refreshing}
        className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
        testID="withdrawn-refresh-status"
        accessibilityRole="button"
        accessibilityLabel="Refresh status"
      >
        {refreshing ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text className="text-body font-semibold text-text-inverse">
            Refresh status
          </Text>
        )}
      </Pressable>

      {canSwitchFromConsentGate(activeProfile, profiles) && (
        <Pressable
          onPress={() => {
            const other = profiles.find((p) => p.id !== activeProfile?.id);
            if (other) {
              void switchProfile(other.id).catch(() => {
                platformAlert('Could not switch profile', 'Please try again.');
              });
            }
          }}
          className="bg-surface rounded-button py-3.5 px-8 items-center mb-3 w-full"
          testID="withdrawn-switch-profile"
          accessibilityRole="button"
          accessibilityLabel="Switch profile"
        >
          <Text className="text-body font-semibold text-text-secondary">
            Switch profile
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => void handleSignOut()}
        className="py-3.5 px-8 items-center w-full"
        testID="withdrawn-sign-out"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text className="text-body font-semibold text-primary">Sign out</Text>
      </Pressable>
    </View>
  );
}

function ConsentPendingGate(): React.ReactElement {
  const AUTO_REFRESH_MS = 15_000;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();

  const handleSignOut = async () => {
    try {
      clearTransitionState();
      await signOut();
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert('Sign Out Failed', 'Please try again or restart the app.');
    }
  };
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { data: consentData } = useConsentStatus();
  const resendMutation = useRequestConsent();
  const { user } = useUser();
  const persona = personaFromBirthYear(activeProfile?.birthYear);
  const copy = getConsentPendingCopy(persona);
  const [checking, setChecking] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState<
    'subjects' | 'coaching' | null
  >(null);
  const [changingEmail, setChangingEmail] = React.useState(false);
  const [newParentEmail, setNewParentEmail] = React.useState('');
  const [changeEmailError, setChangeEmailError] = React.useState('');
  const [resendFeedback, setResendFeedback] = React.useState<
    'sent' | 'error' | null
  >(null);
  const [resendErrorMsg, setResendErrorMsg] = React.useState('');

  // Consent email was sent when status is PARENTAL_CONSENT_REQUESTED
  // (parentEmail alone is not reliable — use the canonical profile status)
  const emailWasSent =
    activeProfile?.consentStatus === 'PARENTAL_CONSENT_REQUESTED';

  const refreshConsentGate = React.useCallback(async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = String(query.queryKey[0]);
        return key === 'profiles' || key === 'consent-status';
      },
    });
  }, [queryClient]);

  const onCheckAgain = async () => {
    setChecking(true);
    try {
      await refreshConsentGate();
    } finally {
      setChecking(false);
    }
  };

  React.useEffect(() => {
    if (!emailWasSent) return;
    const interval = setInterval(() => {
      void refreshConsentGate();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [emailWasSent, refreshConsentGate]);

  const onResend = () => {
    if (!activeProfile || !consentData?.parentEmail || !consentData.consentType)
      return;
    setResendFeedback(null);
    setResendErrorMsg('');
    resendMutation.mutate(
      {
        childProfileId: activeProfile.id,
        parentEmail: consentData.parentEmail,
        consentType: consentData.consentType,
      },
      {
        onSuccess: () => {
          setResendFeedback('sent');
        },
        onError: (err) => {
          setResendFeedback('error');
          setResendErrorMsg(formatApiError(err));
        },
      }
    );
  };

  const parentEmail = consentData?.parentEmail;

  // ── Change-email validation ──────────────────────────────────────────
  const isValidNewEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newParentEmail);
  const childEmail = user?.primaryEmailAddress?.emailAddress;
  const isSameAsChild =
    isValidNewEmail &&
    !!childEmail &&
    newParentEmail.trim().toLowerCase() === childEmail.toLowerCase();
  const canSubmitNewEmail =
    isValidNewEmail &&
    !isSameAsChild &&
    !resendMutation.isPending &&
    !!consentData?.consentType;

  const onSubmitNewEmail = () => {
    if (!activeProfile || !canSubmitNewEmail) return;
    setChangeEmailError('');
    resendMutation.mutate(
      {
        childProfileId: activeProfile.id,
        parentEmail: newParentEmail.trim(),
        consentType: consentData!.consentType!,
      },
      {
        onSuccess: () => {
          const sentTo = newParentEmail.trim();
          setChangingEmail(false);
          setNewParentEmail('');
          setResendFeedback('sent');
          void queryClient.invalidateQueries({
            queryKey: ['consent-status'],
          });
          platformAlert(
            'Link sent!',
            `We sent a consent link to ${sentTo}. Check their inbox (and spam folder).`
          );
        },
        onError: (err) => {
          setChangeEmailError(formatApiError(err));
        },
      }
    );
  };

  // Preview screens replace the gate when active
  if (previewMode === 'subjects') {
    return <PreviewSubjectBrowser onDismiss={() => setPreviewMode(null)} />;
  }
  if (previewMode === 'coaching') {
    return <PreviewSampleCoaching onDismiss={() => setPreviewMode(null)} />;
  }

  // ── No email sent yet (PENDING) — show "send to parent" flow ──────
  if (!emailWasSent) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
        testID="consent-pending-gate"
      >
        <Text className="text-h1 font-bold text-text-primary mb-4 text-center">
          {copy.noEmailSentTitle}
        </Text>
        <Text className="text-body text-text-secondary mb-2 text-center">
          {copy.noEmailSentDescription}
        </Text>
        <Text className="text-body text-text-secondary mb-8 text-center">
          {copy.noEmailSentSubtext}
        </Text>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/consent',
              params: { profileId: activeProfile!.id },
            })
          }
          className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
          testID="consent-send-to-parent"
          accessibilityRole="button"
          accessibilityLabel={copy.sendToParentButton}
        >
          <Text className="text-body font-semibold text-text-inverse">
            {copy.sendToParentButton}
          </Text>
        </Pressable>

        {canSwitchFromConsentGate(activeProfile, profiles) && (
          <Pressable
            onPress={() => {
              const other = profiles.find((p) => p.id !== activeProfile?.id);
              if (other) {
                void switchProfile(other.id).catch(() => {
                  platformAlert(
                    'Could not switch profile',
                    'Please try again.'
                  );
                });
              }
            }}
            className="py-3.5 px-8 items-center mb-3 w-full"
            testID="consent-switch-profile"
            accessibilityRole="button"
            accessibilityLabel="Switch profile"
          >
            <Text className="text-body font-semibold text-text-secondary">
              Switch profile
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => void handleSignOut()}
          className="py-3.5 px-8 items-center w-full"
          testID="consent-sign-out"
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text className="text-body font-semibold text-primary">Sign out</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── Email was sent (PARENTAL_CONSENT_REQUESTED) — waiting UI ──────
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
      testID="consent-pending-gate"
    >
      <Text className="text-h1 font-bold text-text-primary mb-4 text-center">
        {copy.title}
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        {parentEmail
          ? copy.descriptionWithEmail(parentEmail)
          : copy.descriptionWithoutEmail}
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        {copy.subtext}
      </Text>

      <Pressable
        onPress={onCheckAgain}
        disabled={checking}
        className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
        testID="consent-check-again"
        accessibilityRole="button"
        accessibilityLabel="Check again"
      >
        {checking ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text className="text-body font-semibold text-text-inverse">
            Check again
          </Text>
        )}
      </Pressable>

      <Text className="text-body-sm text-text-muted text-center mb-3">
        We&apos;ll keep checking automatically while you wait.
      </Text>

      {parentEmail && consentData?.consentType && !changingEmail && (
        <Pressable
          onPress={onResend}
          disabled={resendMutation.isPending}
          className="bg-surface rounded-button py-3.5 px-8 items-center mb-3 w-full"
          testID="consent-resend"
          accessibilityRole="button"
          accessibilityLabel="Resend approval email"
        >
          {resendMutation.isPending ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text className="text-body font-semibold text-primary">
              Resend email
            </Text>
          )}
        </Pressable>
      )}

      {resendFeedback === 'sent' && !changingEmail && (
        <Text
          className="text-body-sm text-primary text-center mb-3"
          testID="consent-resend-success"
          accessibilityRole="alert"
        >
          Email sent! Check the inbox (and spam folder).
        </Text>
      )}
      {resendFeedback === 'error' && !changingEmail && (
        <View
          className="bg-danger/10 rounded-card px-4 py-3 mb-3 w-full"
          accessibilityRole="alert"
        >
          <Text
            className="text-danger text-body-sm"
            testID="consent-resend-error"
          >
            {resendErrorMsg || 'Something went wrong. Please try again.'}
          </Text>
        </View>
      )}

      {consentData?.consentType && !changingEmail && (
        <Pressable
          onPress={() => {
            setChangingEmail(true);
            setResendFeedback(null);
            setChangeEmailError('');
          }}
          className="py-3.5 px-8 items-center mb-3 w-full"
          testID="consent-change-email"
          accessibilityRole="button"
          accessibilityLabel={copy.changeEmailButton}
        >
          <Text className="text-body font-semibold text-primary">
            {copy.changeEmailButton}
          </Text>
        </Pressable>
      )}

      {changingEmail && (
        <View className="bg-surface rounded-card px-4 py-4 mb-3 w-full">
          <Text className="text-body-sm font-semibold text-text-secondary mb-1">
            {copy.changeEmailLabel}
          </Text>
          <TextInput
            className="bg-background text-text-primary text-body rounded-input px-4 py-3 mb-2"
            placeholder="parent@example.com"
            placeholderTextColor={colors.muted}
            value={newParentEmail}
            onChangeText={setNewParentEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
            editable={!resendMutation.isPending}
            testID="consent-new-email-input"
          />
          {isSameAsChild && (
            <Text
              className="text-danger text-body-sm mb-1"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              testID="consent-change-same-email-warning"
            >
              {copy.sameEmailWarning}
            </Text>
          )}
          {changeEmailError !== '' && (
            <View
              className="bg-danger/10 rounded-card px-4 py-3 mb-2"
              accessibilityRole="alert"
            >
              <Text
                className="text-danger text-body-sm"
                testID="consent-change-email-error"
              >
                {changeEmailError}
              </Text>
            </View>
          )}
          <Pressable
            onPress={onSubmitNewEmail}
            disabled={!canSubmitNewEmail}
            className={`rounded-button py-3.5 items-center mb-2 ${
              canSubmitNewEmail ? 'bg-primary' : 'bg-primary/40'
            }`}
            testID="consent-change-email-submit"
            accessibilityRole="button"
            accessibilityLabel={copy.changeEmailSubmit}
          >
            {resendMutation.isPending ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text className="text-body font-semibold text-text-inverse">
                {copy.changeEmailSubmit}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setChangingEmail(false);
              setNewParentEmail('');
            }}
            className="py-2 items-center"
            testID="consent-change-email-cancel"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text className="text-body-sm text-text-secondary">Cancel</Text>
          </Pressable>
        </View>
      )}

      {/* Preview section */}
      <View className="w-full mt-6 mb-4">
        <View className="flex-row items-center mb-3">
          <View className="flex-1 h-px bg-border" />
          <Text className="text-caption text-text-muted mx-3">
            While you wait
          </Text>
          <View className="flex-1 h-px bg-border" />
        </View>
        <Text className="text-body-sm text-text-secondary text-center mb-3">
          Here's a preview of what you'll learn:
        </Text>
        <Pressable
          onPress={() => setPreviewMode('subjects')}
          className="bg-surface rounded-card px-4 py-3.5 mb-2 flex-row items-center"
          testID="preview-browse-subjects"
          accessibilityRole="button"
          accessibilityLabel="Browse subjects preview"
        >
          <Text className="text-body me-3">{'\u{1F4DA}'}</Text>
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-primary">
              Browse subjects
            </Text>
            <Text className="text-caption text-text-secondary">
              See what you can learn
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setPreviewMode('coaching')}
          className="bg-surface rounded-card px-4 py-3.5 flex-row items-center"
          testID="preview-sample-coaching"
          accessibilityRole="button"
          accessibilityLabel="Sample mentoring preview"
        >
          <Text className="text-body me-3">{'\u{1F3AF}'}</Text>
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-primary">
              Sample mentoring
            </Text>
            <Text className="text-caption text-text-secondary">
              See how your mentor works
            </Text>
          </View>
        </Pressable>
      </View>

      {canSwitchFromConsentGate(activeProfile, profiles) && (
        <Pressable
          onPress={() => {
            const other = profiles.find((p) => p.id !== activeProfile?.id);
            if (other) {
              void switchProfile(other.id).catch(() => {
                platformAlert('Could not switch profile', 'Please try again.');
              });
            }
          }}
          className="py-3.5 px-8 items-center mb-3 w-full"
          testID="consent-switch-profile"
          accessibilityRole="button"
          accessibilityLabel="Switch profile"
        >
          <Text className="text-body font-semibold text-text-secondary">
            Switch profile
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => void handleSignOut()}
        className="py-3.5 px-8 items-center w-full"
        testID="consent-sign-out"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text className="text-body font-semibold text-primary">Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const colors = useThemeColors();
  const tokenVars = useTokenVars();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const currentAppPath = toInternalAppRedirectPath(pathname);
  const {
    activeProfile,
    isLoading: isProfileLoading,
    profileWasRemoved,
    acknowledgeProfileRemoval,
    switchProfile,
  } = useProfile();
  const { isParentProxy, childProfile, parentProfile } = useParentProxy();

  // Sync Clerk auth state with RevenueCat identity (runs on auth change)
  useRevenueCatIdentity();

  const pendingAuthRedirect = isSignedIn ? peekPendingAuthRedirect() : null;
  const replayedAuthRedirectRef = React.useRef<string | null>(null);

  // [M14] Timeout for pendingAuthRedirect spinner
  const [pendingRedirectTimedOut, setPendingRedirectTimedOut] =
    React.useState(false);
  const isPendingRedirectSpinning = !!(
    pendingAuthRedirect && currentAppPath !== pendingAuthRedirect
  );
  React.useEffect(() => {
    if (!isPendingRedirectSpinning) {
      setPendingRedirectTimedOut(false);
      return;
    }
    const t = setTimeout(() => setPendingRedirectTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, [isPendingRedirectSpinning]);

  // [M15] Timeout for isProfileLoading spinner
  const [profileLoadTimedOut, setProfileLoadTimedOut] = React.useState(false);
  React.useEffect(() => {
    if (!isProfileLoading) {
      setProfileLoadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setProfileLoadTimedOut(true), 20_000);
    return () => clearTimeout(t);
  }, [isProfileLoading]);

  // Age-gated Sentry: re-evaluate on profile switch (Story 10.14)
  React.useEffect(() => {
    evaluateSentryForProfile(
      activeProfile?.birthYear ?? null,
      activeProfile?.consentStatus ?? null
    );
  }, [
    activeProfile?.id,
    activeProfile?.birthYear,
    activeProfile?.consentStatus,
  ]);

  React.useEffect(() => {
    if (!pendingAuthRedirect || currentAppPath !== pendingAuthRedirect) {
      return;
    }

    // W-03: on web we can briefly land on the requested route before a later
    // mount-time redirect snaps the tab shell back to /home. Keep the pending
    // redirect alive until the target path stays stable for a short window so
    // the replay effect can recover from that late navigation.
    const clearTimer = setTimeout(() => {
      if (peekPendingAuthRedirect() === pendingAuthRedirect) {
        clearPendingAuthRedirect();
      }
    }, PENDING_AUTH_REDIRECT_SETTLE_MS);

    return () => clearTimeout(clearTimer);
  }, [currentAppPath, pendingAuthRedirect]);

  React.useEffect(() => {
    if (!pendingAuthRedirect || currentAppPath === pendingAuthRedirect) {
      replayedAuthRedirectRef.current = null;
      return;
    }

    if (replayedAuthRedirectRef.current === pendingAuthRedirect) {
      return;
    }

    replayedAuthRedirectRef.current = pendingAuthRedirect;
    router.replace(pendingAuthRedirect as never);
  }, [currentAppPath, pendingAuthRedirect, router]);

  // Auto-dismiss profile-switched toast after 5 seconds
  React.useEffect(() => {
    if (!profileWasRemoved) return;
    const timer = setTimeout(acknowledgeProfileRemoval, 5_000);
    return () => clearTimeout(timer);
  }, [profileWasRemoved, acknowledgeProfileRemoval]);

  // Post-approval landing: show once after parent approves GDPR/COPPA consent
  const [showPostApproval, dismissPostApproval] = usePostApprovalLanding(
    activeProfile?.id,
    activeProfile?.consentStatus
  );
  const [showPermSetup, dismissPermSetup, permState, requestMic, requestNotif] =
    usePermissionSetup(activeProfile?.id);
  usePushTokenRegistration(permState.notif === 'granted');

  if (__DEV__)
    console.log(
      `[AUTH-DEBUG] (app) layout | isLoaded=${isLoaded} | isSignedIn=${isSignedIn}`
    );
  if (!isLoaded)
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  if (!isSignedIn) {
    if (__DEV__)
      console.warn(
        '[AUTH-DEBUG] (app) layout → NOT signed in, bouncing to sign-in'
      );
    const redirectTo = encodeURIComponent(
      rememberPendingAuthRedirect(resolveAuthRedirectPath(pathname))
    );
    return <Redirect href={`/sign-in?redirectTo=${redirectTo}` as const} />;
  }

  if (pendingAuthRedirect && currentAppPath !== pendingAuthRedirect) {
    if (pendingRedirectTimedOut) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title="Couldn't finish navigating"
            message="Tap below to go home."
            primaryAction={{
              label: 'Go Home',
              onPress: () => goBackOrReplace(router, '/(app)/home'),
              testID: 'auth-redirect-timeout-home',
            }}
            testID="auth-redirect-timeout"
          />
        </View>
      );
    }
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="auth-redirect-replay"
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Show a centered spinner while profiles load — never return null (blank
  // screen) because the loading state also fires after switchProfile resets
  // queries.  Returning null made the entire screen disappear on every
  // profile switch and during initial load.
  if (isProfileLoading) {
    if (profileLoadTimedOut) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title="Loading your profile is taking too long"
            message="Try again, or sign out and back in."
            primaryAction={{
              label: 'Retry',
              onPress: () => setProfileLoadTimedOut(false),
              testID: 'profile-loading-timeout-retry',
            }}
            secondaryAction={{
              label: 'Sign out',
              onPress: () => {
                clearTransitionState();
                void clerkSignOut();
              },
              testID: 'profile-loading-timeout-signout',
            }}
            testID="profile-loading-timeout"
          />
        </View>
      );
    }
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="profile-loading"
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // FeedbackProvider wraps ALL authenticated screens (including gates) so
  // shake-to-give-feedback works everywhere after sign-in. Previously it only
  // wrapped the tab navigator, making shake dead on gate screens.
  //
  // key={themeKey} removed — crashes Android Fabric (MENTOMATE-MOBILE-6).
  // NativeWind vars() style updates propagate without remounting.

  // No profile exists — show gate that pushes to profile creation modal
  if (!activeProfile) {
    return (
      <FeedbackProvider>
        <CreateProfileGate />
      </FeedbackProvider>
    );
  }

  // Linked-parent accounts intentionally enter through /(app)/home now.
  // home.tsx renders ParentGateway for owners with child profiles and routes
  // them to /(app)/dashboard only when they explicitly choose progress
  // management. That keeps the adaptive home flow reachable.

  // Gate: block app access when parental consent is pending (COPPA/GDPR)
  if (
    activeProfile?.consentStatus &&
    PENDING_CONSENT_STATUSES.has(activeProfile.consentStatus)
  ) {
    return (
      <FeedbackProvider>
        <ConsentPendingGate />
      </FeedbackProvider>
    );
  }

  // Gate: block access when consent has been withdrawn (deletion pending)
  if (activeProfile?.consentStatus === 'WITHDRAWN') {
    return (
      <FeedbackProvider>
        <ConsentWithdrawnGate />
      </FeedbackProvider>
    );
  }

  // Show celebratory landing once after consent approval
  if (showPostApproval) {
    return (
      <FeedbackProvider>
        <PostApprovalLanding onContinue={dismissPostApproval} />
      </FeedbackProvider>
    );
  }

  if (showPermSetup) {
    return (
      <FeedbackProvider>
        <PermissionSetupGate
          permState={permState}
          onRequestMic={requestMic}
          onRequestNotif={requestNotif}
          onContinue={dismissPermSetup}
        />
      </FeedbackProvider>
    );
  }

  return (
    <FeedbackProvider>
      <View style={[{ flex: 1 }, tokenVars]}>
        {isParentProxy && parentProfile && (
          <ProxyBanner
            childName={childProfile?.displayName ?? ''}
            onSwitchBack={() => void switchProfile(parentProfile.id)}
          />
        )}
        {/* ─── Whitelist tab pattern ────────────────────────────────────
           Only routes listed in VISIBLE_TABS render a tab button.
           Everything else is auto-hidden via screenOptions defaults.
           Adding a new route file to (app)/ will NEVER create a
           phantom tab — no manual Tabs.Screen entry needed.

           Routes in FULL_SCREEN_ROUTES also hide the entire tab bar
           (immersive screens like session, onboarding, homework).
         ──────────────────────────────────────────────────────────── */}
        <Tabs
          screenOptions={({ route }) => {
            const isVisible = VISIBLE_TABS.has(route.name);
            const isFullScreen = FULL_SCREEN_ROUTES.has(route.name);
            return {
              headerShown: false,
              // F-003/F-016/F-055: on web, inactive tab scenes stay in the DOM.
              // An opaque sceneStyle prevents the previous tab from bleeding
              // through when switching to a full-screen route (session, quiz, etc.).
              sceneStyle: { backgroundColor: colors.background },
              tabBarStyle: isFullScreen
                ? {
                    display: 'none',
                    // On some Android devices and Expo web, display:'none'
                    // alone doesn't remove the tab bar from the touch
                    // responder chain. Fully collapse it so it can't
                    // intercept touches or occupy layout space.
                    height: 0,
                    overflow: 'hidden' as const,
                  }
                : {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    height: 56 + Math.max(insets.bottom, 24),
                    paddingBottom: Math.max(insets.bottom, 24),
                  },
              tabBarActiveTintColor: colors.accent,
              tabBarInactiveTintColor: colors.textSecondary,
              tabBarLabelStyle: { fontSize: 12 },
              // Auto-hide any route not in the whitelist.
              // href:null removes the link; tabBarItemStyle removes the
              // flexbox space (Expo Router v6 + React Nav v7 regression).
              ...(isVisible
                ? {}
                : { href: null, tabBarItemStyle: { display: 'none' } }),
            };
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: 'Home',
              tabBarButtonTestID: 'tab-home',
              tabBarAccessibilityLabel: 'Home Tab',
              // Lazy-load the Home tab so the initial mount only renders the
              // visible gate screens (consent, profile creation). The trade-off
              // is a brief spinner on the first Home tap, but it cuts ~200ms
              // off the critical auth→gate path on low-end devices.
              lazy: true,
              tabBarIcon: ({ focused }) => (
                <TabIcon name="Home" focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: 'Library',
              tabBarButtonTestID: 'tab-library',
              tabBarAccessibilityLabel: 'Library Tab',
              tabBarIcon: ({ focused }) => (
                <TabIcon name="Book" focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="progress"
            options={{
              title: 'Progress',
              tabBarButtonTestID: 'tab-progress',
              tabBarAccessibilityLabel: 'Progress Tab',
              tabBarIcon: ({ focused }) => (
                <TabIcon name="Progress" focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="more"
            options={{
              title: 'More',
              tabBarButtonTestID: 'tab-more',
              tabBarAccessibilityLabel: 'More Tab',
              tabBarIcon: ({ focused }) => (
                <TabIcon name="More" focused={focused} />
              ),
            }}
          />
        </Tabs>
        {profileWasRemoved && (
          <Pressable
            onPress={acknowledgeProfileRemoval}
            className="absolute left-4 right-4 z-50"
            style={{ top: insets.top + 8 }}
            testID="profile-switched-toast"
            accessibilityRole="alert"
          >
            <View className="rounded-2xl bg-surface-elevated px-5 py-4 w-full shadow-lg">
              <Text className="text-body font-semibold text-text-primary mb-1">
                Profile switched
              </Text>
              <Text className="text-body-sm text-text-secondary">
                One of your profiles is no longer available, so we've switched
                you to your main profile.
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </FeedbackProvider>
  );
}
