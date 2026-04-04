import React from 'react';
import { Tabs, Redirect, useRouter } from 'expo-router';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk } from '@clerk/clerk-expo';
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

const iconMap: Record<
  string,
  {
    focused: keyof typeof Ionicons.glyphMap;
    default: keyof typeof Ionicons.glyphMap;
  }
> = {
  Home: { focused: 'home', default: 'home-outline' },
  Book: { focused: 'book', default: 'book-outline' },
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
  activeProfile: { id: string; birthYear?: number | null } | null,
  profiles: ReadonlyArray<{ id: string; birthYear?: number | null }>
): boolean {
  if (!activeProfile?.birthYear) return false;
  const currentYear = new Date().getFullYear();
  const age = currentYear - activeProfile.birthYear;
  if (age < 18) return false;
  // Must have at least one OTHER profile that belongs to a minor
  return profiles.some(
    (p) =>
      p.id !== activeProfile.id &&
      p.birthYear != null &&
      currentYear - p.birthYear < 18
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
            Your coach will know what you need each day — whether it's homework
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
            How your coach helps
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            Your AI coach guides you through problems step by step — never gives
            away the answer. You learn by thinking, not copying.
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
              Your coach remembers what you've learned
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
        Let's set up your profile so your coach can get to know you.
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
            if (other) void switchProfile(other.id);
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
        onPress={() => signOut()}
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
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { data: consentData } = useConsentStatus();
  const resendMutation = useRequestConsent();
  const { persona } = useTheme();
  const copy = getConsentPendingCopy(persona);
  const [checking, setChecking] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState<
    'subjects' | 'coaching' | null
  >(null);

  const onCheckAgain = async () => {
    setChecking(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } finally {
      setChecking(false);
    }
  };

  const onResend = () => {
    if (!activeProfile || !consentData?.parentEmail || !consentData.consentType)
      return;
    resendMutation.mutate({
      childProfileId: activeProfile.id,
      parentEmail: consentData.parentEmail,
      consentType: consentData.consentType,
    });
  };

  const parentEmail = consentData?.parentEmail;

  // Preview screens replace the gate when active
  if (previewMode === 'subjects') {
    return <PreviewSubjectBrowser onDismiss={() => setPreviewMode(null)} />;
  }
  if (previewMode === 'coaching') {
    return <PreviewSampleCoaching onDismiss={() => setPreviewMode(null)} />;
  }

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

      {parentEmail && consentData?.consentType && (
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
          accessibilityLabel="Sample coaching preview"
        >
          <Text className="text-body me-3">{'\u{1F3AF}'}</Text>
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-primary">
              Sample coaching
            </Text>
            <Text className="text-caption text-text-secondary">
              See how your coach works
            </Text>
          </View>
        </Pressable>
      </View>

      {canSwitchFromConsentGate(activeProfile, profiles) && (
        <Pressable
          onPress={() => {
            const other = profiles.find((p) => p.id !== activeProfile?.id);
            if (other) void switchProfile(other.id);
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
        onPress={() => signOut()}
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

export default function LearnerLayout() {
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

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

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

  // Linked-parent accounts intentionally enter through /(learner)/home now.
  // home.tsx renders ParentGateway for owners with child profiles and routes
  // them to /(parent)/dashboard only when they explicitly choose progress
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
      </Tabs>
    </View>
  );
}
