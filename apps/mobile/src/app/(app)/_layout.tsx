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
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk, useUser } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from '../../lib/secure-storage';
import {
  useProfile,
  personaFromBirthYear,
  isGuardianProfile,
} from '../../lib/profile';
import { useThemeColors, useTokenVars } from '../../lib/theme';
import { useConsentStatus, useRequestConsent } from '../../hooks/use-consent';
import {
  initNotificationHandler,
  useNotificationResponseHandler,
} from '../../hooks/use-notification-response-handler';
import { usePushTokenRegistration } from '../../hooks/use-push-token-registration';
import { useRevenueCatIdentity } from '../../hooks/use-revenuecat';
import {
  getConsentPendingCopy,
  getConsentWithdrawnCopy,
} from '../../lib/consent-copy';
import { evaluateSentryForProfile } from '../../lib/sentry';
import { formatApiError } from '../../lib/format-api-error';
import { signOutWithCleanup } from '../../lib/sign-out';
import { toInternalAppRedirectPath } from '../../lib/normalize-redirect-path';
import {
  clearPendingAuthRedirect,
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';
import { platformAlert } from '../../lib/platform-alert';
import { FeedbackProvider } from '../../components/feedback/FeedbackProvider';
import { ErrorFallback, GateContent } from '../../components/common';
import { goBackOrReplace } from '../../lib/navigation';
import { useSubjects } from '../../hooks/use-subjects';
import { useParentProxy } from '../../hooks/use-parent-proxy';
import {
  useActiveProfileRole,
  type ActiveProfileRole,
} from '../../hooks/use-active-profile-role';
import { useMentorLanguageSync } from '../../hooks/use-mentor-language-sync';

initNotificationHandler();

// ─── Tab visibility whitelist ────────────────────────────────────────
// Only these routes render a visible tab button. Every other route in
// (app)/ is auto-hidden — no manual Tabs.Screen entry required.
const BASE_VISIBLE_TABS: ReadonlySet<string> = new Set([
  'home',
  'own-learning',
  'library',
  'progress',
  'more',
]);

const STUDENT_HOME_ONLY_TABS: ReadonlySet<string> = new Set(['home']);

export function computeVisibleTabs({
  studentHomeOnly = false,
}: {
  studentHomeOnly?: boolean;
} = {}): Set<string> {
  return new Set<string>(
    studentHomeOnly ? STUDENT_HOME_ONLY_TABS : BASE_VISIBLE_TABS,
  );
}

export function shouldUseStudentHomeOnlyTabs({
  activeProfile,
  profiles,
  isParentProxy,
}: {
  activeProfile: { isOwner: boolean } | null | undefined;
  profiles: ReadonlyArray<{ isOwner: boolean }>;
  isParentProxy: boolean;
}): boolean {
  if (!activeProfile || isParentProxy) return false;
  if (activeProfile.isOwner) return false;
  return !isGuardianProfile(activeProfile, profiles);
}

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
  School: { focused: 'school', default: 'school-outline' },
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
  const { t } = useTranslation();

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
          {t('tabs.proxyBanner.viewing', { name: childName })}
        </Text>
      </View>
      <Pressable
        onPress={onSwitchBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.proxyBanner.switchBackLabel')}
        testID="proxy-banner-switch-back"
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('tabs.proxyBanner.switchBack')}
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
  profiles: ReadonlyArray<{ id: string; birthYear: number }>,
): boolean {
  if (!activeProfile) return false;
  const currentYear = new Date().getFullYear();
  const age = currentYear - activeProfile.birthYear;
  if (age < 18) return false;
  // Must have at least one OTHER profile that belongs to a minor
  return profiles.some(
    (p) => p.id !== activeProfile.id && currentYear - p.birthYear < 18,
  );
}

/**
 * [BUG-776 / M-14] Builds the confirmation prompt + handler for the consent
 * gate "Switch profile" action. Previously the handler silently picked the
 * first non-current profile — for a 2+ child family, the parent could land
 * on a child they weren't expecting. The fix: always confirm the destination
 * by name, and (when more than one alternative exists) list the others in
 * the message so the parent can cancel and try a more deliberate path.
 */
export function buildSwitchProfileConfirmation(params: {
  activeProfile: { id: string } | null;
  profiles: ReadonlyArray<{ id: string; displayName: string }>;
  t: (key: string, options?: Record<string, string>) => string;
}): {
  target: { id: string; displayName: string };
  title: string;
  message: string;
} | null {
  const { activeProfile, profiles, t } = params;
  if (!activeProfile) return null;
  const others = profiles.filter((p) => p.id !== activeProfile.id);
  if (others.length === 0) return null;
  const target = others[0];
  if (!target) return null;
  if (others.length === 1) {
    return {
      target,
      title: t('tabs.switchProfile.title', { name: target.displayName }),
      message: t('tabs.switchProfile.messageSingle', {
        name: target.displayName,
      }),
    };
  }
  const otherNames = others
    .slice(1)
    .map((p) => p.displayName)
    .join(', ');
  return {
    target,
    title: t('tabs.switchProfile.title', { name: target.displayName }),
    message:
      t('tabs.switchProfile.messageSingle', { name: target.displayName }) +
      '\n\n' +
      t('tabs.switchProfile.otherProfiles', { names: otherNames }) +
      '\n\n' +
      t('tabs.switchProfile.cancelHint'),
  };
}

/**
 * Checks whether the post-approval landing screen should be shown.
 * Returns [shouldShow, dismiss] — call dismiss() when user taps "Let's Go".
 */
function usePostApprovalLanding(
  profileId: string | undefined,
  consentStatus: string | null | undefined,
  // [BUG-914] Only child profiles ever see the post-approval celebration —
  // parents (owners) approve consent FOR a child, never receive it, and
  // an impersonating parent isn't the audience for "Your parent said yes"
  // either. Gating on the discriminated role lets all role-aware copy
  // sites (more.tsx, mentor-memory.tsx, this hook) speak one vocabulary.
  role: ActiveProfileRole | null,
): [boolean, () => void] {
  const isConsented = !!profileId && consentStatus === 'CONSENTED';
  const isChildProfile = role === 'child';
  const [shouldShow, setShouldShow] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  // [IMP-2] Only query subjects once we know the screen should show — avoids
  // an unnecessary network request (and loading delay) for users whose SecureStore
  // key is already set to 'true'. For new users, the query fires after the
  // SecureStore async read completes.
  const subjects = useSubjects({
    enabled: isConsented && isChildProfile && checked && shouldShow,
  });

  React.useEffect(() => {
    if (!profileId || consentStatus !== 'CONSENTED' || !isChildProfile) {
      setChecked(true);
      setShouldShow(false);
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
  }, [profileId, consentStatus, isChildProfile]);

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
  return [
    isChildProfile && checked && subjectsReady && shouldShow && !hasSubjects,
    dismiss,
  ];
}

function PostApprovalLanding({
  onContinue,
}: {
  onContinue: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="post-approval-landing"
    >
      <Text
        className="text-4xl mb-6"
        accessibilityLabel={t('tabs.postApproval.celebrationLabel')}
      >
        {'\u{1F389}'}
      </Text>
      <Text
        className="text-h1 font-bold text-text-primary mb-4 text-center"
        accessibilityRole="header"
      >
        {t('tabs.postApproval.title')}
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        {t('tabs.postApproval.parentApproved')}
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        {t('tabs.postApproval.setupSubject')}
      </Text>

      <Pressable
        onPress={onContinue}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full"
        testID="post-approval-continue"
        accessibilityRole="button"
        accessibilityLabel={t('tabs.postApproval.letsGo')}
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('tabs.postApproval.letsGo')}
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
  const { t } = useTranslation();

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
          accessibilityLabel={t('tabs.previewSubjectBrowser.backLabel')}
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">
            {t('common.back')}
          </Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          {t('tabs.previewSubjectBrowser.title')}
        </Text>
      </View>
      <Text className="text-body-sm text-text-secondary px-5 mb-4">
        {t('tabs.previewSubjectBrowser.description')}
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
  const { t } = useTranslation();

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
          accessibilityLabel={t('tabs.previewSampleCoaching.backLabel')}
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">
            {t('common.back')}
          </Text>
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary">
          {t('tabs.previewSampleCoaching.title')}
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="bg-coaching-card rounded-card p-5 mt-4">
          <Text className="text-h3 font-semibold text-text-primary mb-2">
            {t('tabs.previewSampleCoaching.homeworkCardTitle')}
          </Text>
          <Text className="text-body text-text-secondary mb-4">
            {t('tabs.previewSampleCoaching.homeworkCardBody')}
          </Text>
          <View className="bg-surface rounded-button py-3 px-4 mb-2 items-center">
            <Text className="text-body font-semibold text-primary">
              {t('tabs.previewSampleCoaching.homeworkHelp')}
            </Text>
          </View>
          <View className="bg-surface rounded-button py-3 px-4 mb-2 items-center">
            <Text className="text-body font-semibold text-primary">
              {t('tabs.previewSampleCoaching.practiceTest')}
            </Text>
          </View>
        </View>

        <View className="bg-surface rounded-card p-4 mt-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            {t('tabs.previewSampleCoaching.howMentorHelps')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            {t('tabs.previewSampleCoaching.howMentorHelpsBody')}
          </Text>
          <View className="flex-row items-start mb-2">
            <Text className="text-body me-2">{'\u{1F4F7}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              {t('tabs.previewSampleCoaching.snapPhoto')}
            </Text>
          </View>
          <View className="flex-row items-start mb-2">
            <Text className="text-body me-2">{'\u{1F9E0}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              {t('tabs.previewSampleCoaching.mentorRemembers')}
            </Text>
          </View>
          <View className="flex-row items-start">
            <Text className="text-body me-2">{'\u{1F4C8}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              {t('tabs.previewSampleCoaching.trackProgress')}
            </Text>
          </View>
        </View>

        <Text className="text-caption text-text-muted text-center mt-6">
          {t('tabs.previewSampleCoaching.previewDisclaimer')}
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
  const queryClient = useQueryClient();
  const { profiles } = useProfile();
  const { t } = useTranslation();
  const isPushingRef = React.useRef(false);

  const handleSignOut = async () => {
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((p) => p.id),
      });
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert(
        t('tabs.createProfile.signOutFailedTitle'),
        t('tabs.createProfile.signOutFailedMessage'),
      );
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
      <GateContent>
        <Text className="text-h1 font-bold text-text-primary mb-3 text-center">
          {t('tabs.createProfile.welcome')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-8">
          {t('tabs.createProfile.setupProfile')}
        </Text>
        <Pressable
          onPress={handleGetStarted}
          className="bg-primary rounded-button py-3.5 px-8 items-center w-full"
          style={{ minHeight: 48 }}
          testID="create-profile-cta"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.createProfile.getStarted')}
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('tabs.createProfile.getStarted')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void handleSignOut()}
          className="mt-6 py-2 items-center"
          testID="create-profile-gate-signout"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.createProfile.signOutLabel')}
        >
          <Text className="text-caption text-text-muted text-center underline">
            {t('tabs.createProfile.signOut')}
          </Text>
        </Pressable>
      </GateContent>
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
  const { t } = useTranslation();
  const { profiles, activeProfile, switchProfile } = useProfile();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleSignOut = async () => {
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((p) => p.id),
      });
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert(
        t('tabs.createProfile.signOutFailedTitle'),
        t('tabs.createProfile.signOutFailedMessage'),
      );
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
  const persona = personaFromBirthYear(activeProfile?.birthYear);
  const copy = getConsentWithdrawnCopy(persona);

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="consent-withdrawn-gate"
    >
      <GateContent>
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
          accessibilityLabel={t('tabs.consentWithdrawn.refreshStatus')}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-body font-semibold text-text-inverse">
              {t('tabs.consentWithdrawn.refreshStatus')}
            </Text>
          )}
        </Pressable>

        {canSwitchFromConsentGate(activeProfile, profiles) && (
          <Pressable
            onPress={() => {
              // [BUG-776] Confirm destination by name before switching.
              const prompt = buildSwitchProfileConfirmation({
                activeProfile,
                profiles,
                t,
              });
              if (!prompt) return;
              platformAlert(prompt.title, prompt.message, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('tabs.switchProfile.switchButton'),
                  onPress: () => {
                    void switchProfile(prompt.target.id).catch(() => {
                      platformAlert(
                        t('tabs.switchProfile.errorTitle'),
                        t('tabs.switchProfile.errorMessage'),
                      );
                    });
                  },
                },
              ]);
            }}
            className="bg-surface rounded-button py-3.5 px-8 items-center mb-3 w-full"
            testID="withdrawn-switch-profile"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentGate.switchProfile')}
          >
            <Text className="text-body font-semibold text-text-secondary">
              {t('tabs.consentGate.switchProfile')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => void handleSignOut()}
          className="py-3.5 px-8 items-center w-full"
          testID="withdrawn-sign-out"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.consentGate.signOut')}
        >
          <Text className="text-body font-semibold text-primary">
            {t('tabs.consentGate.signOut')}
          </Text>
        </Pressable>
      </GateContent>
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
  const { t } = useTranslation();
  const { profiles, activeProfile, switchProfile } = useProfile();

  const handleSignOut = async () => {
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((p) => p.id),
      });
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert(
        t('tabs.createProfile.signOutFailedTitle'),
        t('tabs.createProfile.signOutFailedMessage'),
      );
    }
  };
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
      },
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
    const consentType = consentData?.consentType;
    if (!consentType) return;
    setChangeEmailError('');
    resendMutation.mutate(
      {
        childProfileId: activeProfile.id,
        parentEmail: newParentEmail.trim(),
        consentType,
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
            t('tabs.consentPending.linkSentTitle'),
            t('tabs.consentPending.linkSentMessage', { email: sentTo }),
          );
        },
        onError: (err) => {
          setChangeEmailError(formatApiError(err));
        },
      },
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
        <GateContent>
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
            onPress={() => {
              if (!activeProfile) return;
              router.push({
                pathname: '/consent',
                params: { profileId: activeProfile.id },
              });
            }}
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
                // [BUG-776] Confirm destination by name before switching.
                const prompt = buildSwitchProfileConfirmation({
                  activeProfile,
                  profiles,
                  t,
                });
                if (!prompt) return;
                platformAlert(prompt.title, prompt.message, [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('tabs.switchProfile.switchButton'),
                    onPress: () => {
                      void switchProfile(prompt.target.id).catch(() => {
                        platformAlert(
                          'Could not switch profile',
                          'Please try again.',
                        );
                      });
                    },
                  },
                ]);
              }}
              className="py-3.5 px-8 items-center mb-3 w-full"
              testID="consent-switch-profile"
              accessibilityRole="button"
              accessibilityLabel={t('tabs.consentGate.switchProfile')}
            >
              <Text className="text-body font-semibold text-text-secondary">
                {t('tabs.consentGate.switchProfile')}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => void handleSignOut()}
            className="py-3.5 px-8 items-center w-full"
            testID="consent-sign-out"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentGate.signOut')}
          >
            <Text className="text-body font-semibold text-primary">
              {t('tabs.consentGate.signOut')}
            </Text>
          </Pressable>
        </GateContent>
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
      <GateContent>
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
          accessibilityLabel={t('tabs.consentPending.checkAgain')}
        >
          {checking ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text className="text-body font-semibold text-text-inverse">
              {t('tabs.consentPending.checkAgain')}
            </Text>
          )}
        </Pressable>

        <Text className="text-body-sm text-text-muted text-center mb-3">
          {t('tabs.consentPending.autoChecking')}
        </Text>

        {parentEmail && consentData?.consentType && !changingEmail && (
          <Pressable
            onPress={onResend}
            disabled={resendMutation.isPending}
            className="bg-surface rounded-button py-3.5 px-8 items-center mb-3 w-full"
            testID="consent-resend"
            accessibilityRole="button"
            accessibilityLabel={t(
              'tabs.consentPending.resendApprovalEmailLabel',
            )}
          >
            {resendMutation.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text className="text-body font-semibold text-primary">
                {t('tabs.consentPending.resendEmail')}
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
            {t('tabs.consentPending.emailSentFeedback')}
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
              {resendErrorMsg || t('errors.generic')}
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
              placeholder={t('tabs.consentPending.parentEmailPlaceholder')}
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
              accessibilityLabel={t('common.cancel')}
            >
              <Text className="text-body-sm text-text-secondary">
                {t('common.cancel')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Preview section */}
        <View className="w-full mt-6 mb-4">
          <View className="flex-row items-center mb-3">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-caption text-text-muted mx-3">
              {t('tabs.consentPending.whileYouWait')}
            </Text>
            <View className="flex-1 h-px bg-border" />
          </View>
          <Text className="text-body-sm text-text-secondary text-center mb-3">
            {t('tabs.consentPending.previewIntro')}
          </Text>
          <Pressable
            onPress={() => setPreviewMode('subjects')}
            className="bg-surface rounded-card px-4 py-3.5 mb-2 flex-row items-center"
            testID="preview-browse-subjects"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentPending.browseSubjectsLabel')}
          >
            <Text className="text-body me-3">{'\u{1F4DA}'}</Text>
            <View className="flex-1">
              <Text className="text-body font-semibold text-text-primary">
                {t('tabs.consentPending.browseSubjects')}
              </Text>
              <Text className="text-caption text-text-secondary">
                {t('tabs.consentPending.browseSubjectsHint')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setPreviewMode('coaching')}
            className="bg-surface rounded-card px-4 py-3.5 flex-row items-center"
            testID="preview-sample-coaching"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentPending.sampleMentoringLabel')}
          >
            <Text className="text-body me-3">{'\u{1F3AF}'}</Text>
            <View className="flex-1">
              <Text className="text-body font-semibold text-text-primary">
                {t('tabs.consentPending.sampleMentoring')}
              </Text>
              <Text className="text-caption text-text-secondary">
                {t('tabs.consentPending.sampleMentoringHint')}
              </Text>
            </View>
          </Pressable>
        </View>

        {canSwitchFromConsentGate(activeProfile, profiles) && (
          <Pressable
            onPress={() => {
              // [BUG-776] Confirm destination by name before switching.
              const prompt = buildSwitchProfileConfirmation({
                activeProfile,
                profiles,
                t,
              });
              if (!prompt) return;
              platformAlert(prompt.title, prompt.message, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('tabs.switchProfile.switchButton'),
                  onPress: () => {
                    void switchProfile(prompt.target.id).catch(() => {
                      platformAlert(
                        t('tabs.switchProfile.errorTitle'),
                        t('tabs.switchProfile.errorMessage'),
                      );
                    });
                  },
                },
              ]);
            }}
            className="py-3.5 px-8 items-center mb-3 w-full"
            testID="consent-switch-profile"
            accessibilityRole="button"
            accessibilityLabel={t('tabs.consentGate.switchProfile')}
          >
            <Text className="text-body font-semibold text-text-secondary">
              {t('tabs.consentGate.switchProfile')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => void handleSignOut()}
          className="py-3.5 px-8 items-center w-full"
          testID="consent-sign-out"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.consentGate.signOut')}
        >
          <Text className="text-body font-semibold text-primary">
            {t('tabs.consentGate.signOut')}
          </Text>
        </Pressable>
      </GateContent>
    </ScrollView>
  );
}

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const colors = useThemeColors();
  const tokenVars = useTokenVars();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const currentAppPath = toInternalAppRedirectPath(pathname);
  const {
    profiles,
    activeProfile,
    isLoading: isProfileLoading,
    profileLoadError,
    profileWasRemoved,
    acknowledgeProfileRemoval,
    switchProfile,
  } = useProfile();
  useMentorLanguageSync();
  const { isParentProxy, childProfile, parentProfile } = useParentProxy();
  const role = useActiveProfileRole();
  const studentHomeOnlyTabs = shouldUseStudentHomeOnlyTabs({
    activeProfile,
    profiles,
    isParentProxy,
  });
  const visibleTabs = React.useMemo(
    () => computeVisibleTabs({ studentHomeOnly: studentHomeOnlyTabs }),
    [studentHomeOnlyTabs],
  );

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
      activeProfile?.consentStatus ?? null,
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

  // Post-approval landing: show once after parent approves GDPR/COPPA consent.
  // [BUG-914] Gate on role === 'child' so the celebration is suppressed for
  // parent profiles (relevant when a parent switches back from impersonating
  // a child and lands here) AND for impersonated-child sessions (where the
  // user is actually the parent and would see "Your parent said yes" while
  // operating their own account).
  const [showPostApproval, dismissPostApproval] = usePostApprovalLanding(
    activeProfile?.id,
    activeProfile?.consentStatus,
    role,
  );
  usePushTokenRegistration();
  useNotificationResponseHandler();

  // [BUG-923] Previously fired on every render of the (app) layout, drowning
  // signal in noise during debugging sessions. Log only when isLoaded or
  // isSignedIn actually transition.
  React.useEffect(() => {
    if (__DEV__) {
      console.log(
        `[AUTH-DEBUG] (app) layout | isLoaded=${isLoaded} | isSignedIn=${isSignedIn}`,
      );
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded)
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  if (!isSignedIn) {
    if (__DEV__)
      console.warn(
        '[AUTH-DEBUG] (app) layout → NOT signed in, bouncing to sign-in',
      );
    const redirectTo = encodeURIComponent(
      rememberPendingAuthRedirect(resolveAuthRedirectPath(pathname)),
    );
    return <Redirect href={`/sign-in?redirectTo=${redirectTo}` as const} />;
  }

  if (pendingAuthRedirect && currentAppPath !== pendingAuthRedirect) {
    if (pendingRedirectTimedOut) {
      return (
        <View className="flex-1 bg-background">
          <ErrorFallback
            variant="centered"
            title={t('tabs.authRedirectTimeout.title')}
            message={t('tabs.authRedirectTimeout.message')}
            primaryAction={{
              label: t('common.goHome'),
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
            title={t('tabs.profileLoadTimeout.title')}
            message={t('tabs.profileLoadTimeout.message')}
            primaryAction={{
              label: t('common.retry'),
              onPress: () => setProfileLoadTimedOut(false),
              testID: 'profile-loading-timeout-retry',
            }}
            secondaryAction={{
              label: t('common.signOut'),
              onPress: () => {
                void signOutWithCleanup({
                  clerkSignOut,
                  queryClient,
                  profileIds: profiles.map((p) => p.id),
                });
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

  // If the profile query fails, do not treat it as "no profiles". That would
  // push an existing user into first-time profile creation and can trigger a
  // confusing add-profile subscription limit.
  if (profileLoadError) {
    return (
      <View className="flex-1 bg-background">
        <ErrorFallback
          variant="centered"
          title="We could not load your profile"
          message="Retry loading your profile, or sign out and sign in again."
          primaryAction={{
            label: t('common.retry'),
            onPress: () => {
              setProfileLoadTimedOut(false);
              void queryClient.invalidateQueries({ queryKey: ['profiles'] });
              void queryClient.refetchQueries({ queryKey: ['profiles'] });
            },
            testID: 'profile-load-error-retry',
          }}
          secondaryAction={{
            label: t('common.signOut'),
            onPress: () => {
              void signOutWithCleanup({
                clerkSignOut,
                queryClient,
                profileIds: profiles.map((p) => p.id),
              });
            },
            testID: 'profile-load-error-signout',
          }}
          testID="profile-load-error"
        />
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
  // home.tsx renders the parent JTBD surface for owners with child profiles.

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
           Only routes listed in visibleTabs render a tab button.
           Everything else is auto-hidden via screenOptions defaults.
           Adding a new route file to (app)/ will NEVER create a
           phantom tab — no manual Tabs.Screen entry needed.

           Routes in FULL_SCREEN_ROUTES also hide the entire tab bar
           (immersive screens like session, onboarding, homework).
         ──────────────────────────────────────────────────────────── */}
        <Tabs
          screenOptions={({ route }) => {
            const isVisible = visibleTabs.has(route.name);
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
              title: t('tabs.home'),
              tabBarButtonTestID: 'tab-home',
              tabBarAccessibilityLabel: t('tabs.homeLabel'),
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
            name="own-learning"
            options={{
              title: t('tabs.myLearning'),
              tabBarButtonTestID: 'tab-my-learning',
              tabBarAccessibilityLabel: t('tabs.myLearningLabel'),
              tabBarIcon: ({ focused }) => (
                <TabIcon name="School" focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: t('tabs.library'),
              tabBarButtonTestID: 'tab-library',
              tabBarAccessibilityLabel: t('tabs.libraryLabel'),
              tabBarIcon: ({ focused }) => (
                <TabIcon name="Book" focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="progress"
            options={{
              title: t('tabs.progress'),
              tabBarButtonTestID: 'tab-progress',
              tabBarAccessibilityLabel: t('tabs.progressLabel'),
              tabBarIcon: ({ focused }) => (
                <TabIcon name="Progress" focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="more"
            options={{
              title: t('tabs.more'),
              tabBarButtonTestID: 'tab-more',
              tabBarAccessibilityLabel: t('tabs.moreLabel'),
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
                {t('tabs.profileSwitchedToast.title')}
              </Text>
              <Text className="text-body-sm text-text-secondary">
                {t('tabs.profileSwitchedToast.message')}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </FeedbackProvider>
  );
}
