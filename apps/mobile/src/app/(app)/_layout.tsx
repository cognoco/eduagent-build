import React from 'react';
import { Tabs, Redirect, useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk, useUser } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useProfile } from '../../lib/profile';
import { useTheme, useThemeColors, useTokenVars } from '../../lib/theme';
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

/** Consent statuses that block app access */
const PENDING_CONSENT_STATUSES = new Set([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
]);

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
  const [shouldShow, setShouldShow] = React.useState(false);
  const [checked, setChecked] = React.useState(false);

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
    void SecureStore.setItemAsync(key, 'true');
  }, [profileId]);

  return [checked && shouldShow, dismiss];
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

  const handleSignOut = async () => {
    try {
      clearTransitionState();
      await signOut();
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      Alert.alert('Sign Out Failed', 'Please try again or restart the app.');
    }
  };

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
        onPress={() => router.push('/create-profile')}
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

  const handleSignOut = async () => {
    try {
      clearTransitionState();
      await signOut();
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      Alert.alert('Sign Out Failed', 'Please try again or restart the app.');
    }
  };
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { persona } = useTheme();
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

      {canSwitchFromConsentGate(activeProfile, profiles) && (
        <Pressable
          onPress={() => {
            const other = profiles.find((p) => p.id !== activeProfile?.id);
            if (other) {
              void switchProfile(other.id).catch(() => {
                Alert.alert('Could not switch profile', 'Please try again.');
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
      Alert.alert('Sign Out Failed', 'Please try again or restart the app.');
    }
  };
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { data: consentData } = useConsentStatus();
  const resendMutation = useRequestConsent();
  const { user } = useUser();
  const { persona } = useTheme();
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
          Alert.alert(
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
                  Alert.alert('Could not switch profile', 'Please try again.');
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
                Alert.alert('Could not switch profile', 'Please try again.');
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
  const colors = useThemeColors();
  const tokenVars = useTokenVars();
  const insets = useSafeAreaInsets();
  const {
    activeProfile,
    isLoading: isProfileLoading,
    profileWasRemoved,
    acknowledgeProfileRemoval,
  } = useProfile();

  // Register push token on app launch (runs once, guarded internally)
  usePushTokenRegistration();

  // Sync Clerk auth state with RevenueCat identity (runs on auth change)
  useRevenueCatIdentity();

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

  // Show alert when a profile was removed server-side (consent denied / auto-deleted)
  React.useEffect(() => {
    if (profileWasRemoved) {
      Alert.alert(
        'Profile switched',
        "One of your profiles is no longer available, so we've switched you to your main profile. Everything else is just as you left it.",
        [{ text: 'OK', onPress: acknowledgeProfileRemoval }]
      );
    }
  }, [profileWasRemoved, acknowledgeProfileRemoval]);

  // Post-approval landing: show once after parent approves GDPR/COPPA consent
  const [showPostApproval, dismissPostApproval] = usePostApprovalLanding(
    activeProfile?.id,
    activeProfile?.consentStatus
  );

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
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Show a centered spinner while profiles load — never return null (blank
  // screen) because the loading state also fires after switchProfile resets
  // queries.  Returning null made the entire screen disappear on every
  // profile switch and during initial load.
  if (isProfileLoading)
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="profile-loading"
      >
        <ActivityIndicator size="large" />
      </View>
    );

  // No profile exists — show gate that pushes to profile creation modal
  if (!activeProfile) return <CreateProfileGate />;

  // Linked-parent accounts intentionally enter through /(app)/home now.
  // home.tsx renders ParentGateway for owners with child profiles and routes
  // them to /(app)/dashboard only when they explicitly choose progress
  // management. That keeps the adaptive home flow reachable.

  // Gate: block app access when parental consent is pending (COPPA/GDPR)
  if (
    activeProfile?.consentStatus &&
    PENDING_CONSENT_STATUSES.has(activeProfile.consentStatus)
  ) {
    return <ConsentPendingGate />;
  }

  // Gate: block access when consent has been withdrawn (deletion pending)
  if (activeProfile?.consentStatus === 'WITHDRAWN') {
    return <ConsentWithdrawnGate />;
  }

  // Show celebratory landing once after consent approval
  if (showPostApproval) {
    return <PostApprovalLanding onContinue={dismissPostApproval} />;
  }

  // key={themeKey} removed — crashes Android Fabric (MENTOMATE-MOBILE-6).
  // NativeWind vars() style updates propagate without remounting.
  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 56 + Math.max(insets.bottom, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarButtonTestID: 'tab-home',
            tabBarAccessibilityLabel: 'Home Tab',
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
        <Tabs.Screen
          name="onboarding"
          options={{
            href: null,
            // tabBarItemStyle hides the tab button so it does not occupy
            // flexbox space when another tab is active (Expo Router v6 +
            // React Navigation v7 regression — href:null alone is not enough).
            tabBarItemStyle: { display: 'none' },
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="session"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="topic"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="subscription"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="homework"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="subject"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="learn"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="learn-new"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="shelf"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="mentor-memory"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="pick-book"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="dashboard"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="child/[profileId]"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="progress/[subjectId]"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
      </Tabs>
    </View>
  );
}
