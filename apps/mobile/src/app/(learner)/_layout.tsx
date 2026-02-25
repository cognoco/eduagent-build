import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useProfile } from '../../lib/profile';
import { useTheme, useThemeColors } from '../../lib/theme';
import { useConsentStatus, useRequestConsent } from '../../hooks/use-consent';
import { usePushTokenRegistration } from '../../hooks/use-push-token-registration';

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
      color={focused ? colors.accent : colors.muted}
    />
  );
}

/** Consent statuses that block app access */
const PENDING_CONSENT_STATUSES = new Set([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
]);

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
    SecureStore.getItemAsync(key)
      .then((value) => {
        setShouldShow(value !== 'true');
        setChecked(true);
      })
      .catch(() => {
        setChecked(true);
      });
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
          className="mr-3 min-w-[44px] min-h-[44px] justify-center items-center"
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
                  className="w-2 h-2 rounded-full mr-2"
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
          className="mr-3 min-w-[44px] min-h-[44px] justify-center items-center"
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
            <Text className="text-body mr-2">{'\u{1F4F7}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              Snap a photo of your homework to get started
            </Text>
          </View>
          <View className="flex-row items-start mb-2">
            <Text className="text-body mr-2">{'\u{1F9E0}'}</Text>
            <Text className="text-body-sm text-text-secondary flex-1">
              Your coach remembers what you've learned
            </Text>
          </View>
          <View className="flex-row items-start">
            <Text className="text-body mr-2">{'\u{1F4C8}'}</Text>
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
 * Gate shown when a parent has withdrawn consent.
 * Child's access is fully blocked during the 7-day deletion grace period.
 * Different messaging from ConsentPendingGate — this is about account deletion.
 */
function ConsentWithdrawnGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const { profiles, activeProfile, switchProfile } = useProfile();

  // Estimate deletion date: 7 days from when status changed to WITHDRAWN.
  // We don't have revokedAt on the client — approximate with "within 7 days".

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
        Account deletion pending
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        Your parent has withdrawn consent for your account.
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        Your data will be permanently deleted within 7 days.
      </Text>
      <Text className="text-body-sm text-text-muted mb-8 text-center">
        If this was a mistake, ask your parent to restore consent from their
        dashboard.
      </Text>

      {profiles.length > 1 && activeProfile && (
        <Pressable
          onPress={() => {
            const other = profiles.find((p) => p.id !== activeProfile.id);
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
        Waiting for approval
      </Text>
      <Text className="text-body text-text-secondary mb-2 text-center">
        {parentEmail
          ? `We sent an email to ${parentEmail}.`
          : 'We sent an email to your parent or guardian.'}
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        Once they approve, you'll have full access.
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
          <Text className="text-body mr-3">{'\u{1F4DA}'}</Text>
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
          <Text className="text-body mr-3">{'\u{1F3AF}'}</Text>
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

      {profiles.length > 1 && activeProfile && (
        <Pressable
          onPress={() => {
            const other = profiles.find((p) => p.id !== activeProfile.id);
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
  const { persona } = useTheme();
  const colors = useThemeColors();
  const { activeProfile, isLoading: isProfileLoading } = useProfile();

  // Register push token on app launch (runs once, guarded internally)
  usePushTokenRegistration();

  // Post-approval landing: show once after parent approves GDPR/COPPA consent
  const [showPostApproval, dismissPostApproval] = usePostApprovalLanding(
    activeProfile?.id,
    activeProfile?.consentStatus
  );

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (persona === 'parent') return <Redirect href="/(parent)/dashboard" />;

  // Show nothing while profiles are still loading to avoid flash
  if (isProfileLoading) return null;

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

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="book"
          options={{
            title: 'Learning Book',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Book" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="More" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="onboarding"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="session"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="topic"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="subscription"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="homework"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
      </Tabs>
    </View>
  );
}
