import {
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Linking,
  Share,
} from 'react-native';
import { useState, useCallback } from 'react';
import { platformAlert } from '../../lib/platform-alert';
import { clearTransitionState } from '../../lib/auth-transition';
import { clearProfileSecureStorageOnSignOut } from '../../lib/sign-out-cleanup';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import type {
  AccommodationMode,
  ConversationLanguage,
  KnowledgeInventory,
  LearningMode,
} from '@eduagent/schemas';
import { useProfile } from '../../lib/profile';
import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useQueryClient } from '@tanstack/react-query';
import { isNewLearner } from '../../lib/progressive-disclosure';
import { useExportData } from '../../hooks/use-account';
import {
  useLearnerProfile,
  useUpdateAccommodationMode,
} from '../../hooks/use-learner-profile';
import { useFamilySubscription } from '../../hooks/use-subscription';
import { AccountSecurity } from '../../components/account-security';
import { useFeedbackContext } from '../../components/feedback/FeedbackProvider';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
  useLearningMode,
  useUpdateLearningMode,
  useCelebrationLevel,
  useUpdateCelebrationLevel,
} from '../../hooks/use-settings';
import { useSubscription } from '../../hooks/use-subscription';
import { ACCOMMODATION_OPTIONS } from '../../lib/accommodation-options';
import { formatApiError } from '../../lib/format-api-error';

function SettingsRow({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
      style={({ pressed }) => ({
        ...(pressed ? { opacity: 0.6 } : {}),
        ...(Platform.OS === 'web' && onPress ? { cursor: 'pointer' } : {}),
      })}
      accessibilityLabel={label}
      accessibilityRole="button"
      testID={testID}
    >
      <Text className="text-body text-text-primary">{label}</Text>
      {value && (
        <Text className="text-body-sm text-text-secondary">{value}</Text>
      )}
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2">
      <Text className="text-body text-text-primary">{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        accessibilityLabel={label}
      />
    </View>
  );
}

// BKT-C.1 — Settings display names for the 8 supported tutor languages. Kept
// inline (rather than imported from onboarding/language-picker.tsx) to avoid
// Expo Router treating a shared helper under app/(app)/ as a route. The source
// of truth for the allowed codes is packages/schemas/src/profiles.ts.
const TUTOR_LANGUAGE_LABELS: Record<ConversationLanguage, string> = {
  en: 'English',
  cs: 'Czech',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  pl: 'Polish',
  pt: 'Portuguese',
};

const LEARNING_MODE_OPTIONS: {
  mode: LearningMode;
  title: string;
  description: string;
}[] = [
  {
    mode: 'casual',
    title: 'Explorer',
    description:
      'Learn at your own pace. Your mentor is relaxed and encouraging. You earn points right away and can skip recaps.',
  },
  {
    mode: 'serious',
    title: 'Challenge mode',
    description:
      'Push yourself further. Your mentor keeps you on track. You earn points after proving you remember, and recaps help lock it in.',
  },
];

function LearningModeOption({
  title,
  description,
  selected,
  disabled,
  onPress,
  testID,
}: {
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
        selected ? 'border-2 border-primary' : 'border-2 border-transparent'
      }`}
      accessibilityLabel={`${title}: ${description}`}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      testID={testID}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-body font-semibold text-text-primary">
          {title}
        </Text>
        {selected && (
          <Text className="text-primary text-body font-semibold">Active</Text>
        )}
      </View>
      <Text className="text-body-sm text-text-secondary mt-1">
        {description}
      </Text>
    </Pressable>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { activeProfile, profiles } = useProfile();
  // [BUG-915] When the parent is impersonating a child profile, the More tab
  // must hide account-level destructive actions (Sign out, Delete account,
  // Export my data, Subscription). Those operate on the parent's underlying
  // account and are unsafe to expose while "Viewing TestKid's account" — the
  // ProxyBanner at the top of (app)/_layout already provides the Switch-back
  // pointer, so no additional escape affordance is needed in this screen.
  // Uses the discriminated useActiveProfileRole() so the same role guard
  // shape applies in mentor-memory and the post-approval landing.
  const role = useActiveProfileRole();
  const isImpersonating = role === 'impersonated-child';
  const queryClient = useQueryClient();
  const cachedInventory = queryClient.getQueryData<KnowledgeInventory>([
    'progress',
    'inventory',
    activeProfile?.id,
  ]);
  const hideMentorMemory = isNewLearner(cachedInventory?.global.totalSessions);
  const exportData = useExportData();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro'
  );
  const { data: notifPrefs, isLoading: notifLoading } =
    useNotificationSettings();
  const updateNotifications = useUpdateNotificationSettings();
  const { data: learningMode, isLoading: modeLoading } = useLearningMode();
  const updateLearningMode = useUpdateLearningMode();
  const { data: celebrationLevel, isLoading: celebrationLoading } =
    useCelebrationLevel();
  const updateCelebrationLevel = useUpdateCelebrationLevel();
  const { data: learnerProfile } = useLearnerProfile();
  const updateAccommodation = useUpdateAccommodationMode();
  const { openFeedback } = useFeedbackContext();

  const pushEnabled = notifPrefs?.pushEnabled ?? false;
  const weeklyDigest = notifPrefs?.weeklyProgressPush ?? false;

  const handleTogglePush = useCallback(
    (value: boolean) => {
      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs?.reviewReminders ?? false,
          dailyReminders: notifPrefs?.dailyReminders ?? false,
          weeklyProgressPush: notifPrefs?.weeklyProgressPush ?? true,
          pushEnabled: value,
        },
        {
          onError: () => {
            platformAlert(
              'Could not update notification settings',
              'Please try again.'
            );
          },
        }
      );
    },
    [updateNotifications, notifPrefs]
  );

  const handleToggleDigest = useCallback(
    (value: boolean) => {
      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs?.reviewReminders ?? false,
          dailyReminders: notifPrefs?.dailyReminders ?? false,
          weeklyProgressPush: value,
          pushEnabled: notifPrefs?.pushEnabled ?? false,
        },
        {
          onError: () => {
            platformAlert(
              'Could not update notification settings',
              'Please try again.'
            );
          },
        }
      );
    },
    [updateNotifications, notifPrefs]
  );

  const handleSelectMode = useCallback(
    (mode: LearningMode) => {
      // [BUG-814] In addition to the JSX `disabled={updateLearningMode.isPending}`
      // guard, fail closed at the handler level. A rapid double-tap can fire
      // before React processes the disabled re-render, so the JSX guard is
      // necessary but not sufficient.
      if (updateLearningMode.isPending) return;
      if (mode !== learningMode) {
        updateLearningMode.mutate(mode, {
          onError: () => {
            platformAlert('Could not save setting', 'Please try again.');
          },
        });
      }
    },
    [learningMode, updateLearningMode]
  );

  const handleSelectAccommodation = useCallback(
    (mode: AccommodationMode) => {
      if (mode === (learnerProfile?.accommodationMode ?? 'none')) return;
      updateAccommodation.mutate(
        { accommodationMode: mode },
        {
          onError: () => {
            platformAlert('Could not save setting', 'Please try again.');
          },
        }
      );
    },
    [learnerProfile?.accommodationMode, updateAccommodation]
  );

  const handleExport = useCallback(async () => {
    try {
      const data = await exportData.mutateAsync();
      const jsonString = JSON.stringify(data, null, 2);

      if (Platform.OS === 'web') {
        // [BUG-509] Web Share API is not universally supported — file download instead
        // Use globalThis casts to avoid DOM-lib requirement in RN tsconfig.
        type WebDoc = {
          createElement(tag: string): {
            href: string;
            download: string;
            click(): void;
          };
        };
        const doc = (globalThis as { document?: WebDoc }).document;
        if (!doc) return;
        // RN globals.d.ts requires both `type` and `lastModified` in BlobOptions.
        const blob = new Blob([jsonString], {
          type: 'application/json',
          lastModified: Date.now(),
        });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = 'mentomate-data-export.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const result = await Share.share({
          title: 'MentoMate account data export',
          message: jsonString,
        });
        // [UX-DE-L4] iOS returns dismissedAction when the user cancels the
        // share sheet — treat it as a no-op, not a success or error.
        if (result.action === Share.dismissedAction) {
          return;
        }
      }
    } catch (err: unknown) {
      platformAlert('Export failed', formatApiError(err));
    }
  }, [exportData]);

  const handleHelp = useCallback(async () => {
    try {
      await Linking.openURL(
        'mailto:support@mentomate.app?subject=MentoMate%20Support'
      );
    } catch {
      platformAlert(
        'Contact support',
        'Email support@mentomate.app for help with your account.'
      );
    }
  }, []);

  const handleAddChild = useCallback(() => {
    if (!subscription) {
      // Query still loading — don't block with a false 'Upgrade required'
      return;
    }
    const tier = subscription.tier;
    // Whitelist: only family/pro may add children. Blocks free and plus.
    if (tier !== 'family' && tier !== 'pro') {
      platformAlert(
        'Upgrade required',
        'Adding child profiles requires a Family or Pro subscription.',
        [
          {
            text: 'View plans',
            onPress: () => router.push('/(app)/subscription'),
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    if (familyData && familyData.profileCount >= familyData.maxProfiles) {
      platformAlert(
        'Profile limit reached',
        `Your ${tier === 'pro' ? 'Pro' : 'Family'} plan supports up to ${
          familyData.maxProfiles
        } profiles.`,
        tier === 'family'
          ? [
              {
                text: 'View plans',
                onPress: () => router.push('/(app)/subscription'),
              },
              { text: 'OK', style: 'cancel' },
            ]
          : [{ text: 'OK' }]
      );
      return;
    }

    router.push('/create-profile');
  }, [subscription, familyData, router]);

  const linkedChildren = activeProfile?.isOwner
    ? profiles.filter((p) => p.id !== activeProfile.id && !p.isOwner)
    : [];

  const displayName =
    activeProfile?.displayName ??
    user?.fullName ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    'User';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">More</Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Learning Mode */}
        {/* BUG-909: Prefix with the active profile's display name and add a */}
        {/* clarifying subtitle so parents know these toggles apply to their */}
        {/* OWN learning sessions, not their child's. The child's settings */}
        {/* live on /child/[id] (per-profile surface). */}
        <Text
          className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-1 mt-4"
          testID="learning-mode-section-header"
        >
          {`${displayName}'s Learning Mode`}
        </Text>
        <Text className="text-caption text-text-secondary mb-2">
          {activeProfile?.isOwner && linkedChildren.length > 0
            ? "Applies to your own sessions. To change a child's, open their profile from the dashboard."
            : 'Applies to your own learning sessions.'}
        </Text>
        {LEARNING_MODE_OPTIONS.map((opt) => (
          <LearningModeOption
            key={opt.mode}
            title={opt.title}
            description={opt.description}
            selected={learningMode === opt.mode}
            disabled={modeLoading || updateLearningMode.isPending}
            onPress={() => handleSelectMode(opt.mode)}
            testID={`learning-mode-${opt.mode}`}
          />
        ))}

        {/* 2. Learning Accommodation */}
        <Text
          className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-1 mt-6"
          testID="learning-accommodation-section-header"
        >
          {`${displayName}'s Learning Accommodation`}
        </Text>
        <Text className="text-caption text-text-secondary mb-2">
          {activeProfile?.isOwner && linkedChildren.length > 0
            ? "Applies to your own sessions. To change a child's, open their profile from the dashboard."
            : 'Applies to your own learning sessions.'}
        </Text>
        {ACCOMMODATION_OPTIONS.map((opt) => (
          <LearningModeOption
            key={opt.mode}
            title={opt.title}
            description={opt.description}
            selected={
              (learnerProfile?.accommodationMode ?? 'none') === opt.mode
            }
            disabled={updateAccommodation.isPending}
            onPress={() => handleSelectAccommodation(opt.mode)}
            testID={`accommodation-mode-${opt.mode}`}
          />
        ))}

        {/* 3. What My Mentor Knows — shown after learning prefs, hidden for new learners */}
        {!hideMentorMemory ? (
          <>
            <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
              What My Mentor Knows
            </Text>
            <SettingsRow
              label="View & manage"
              onPress={() => router.push('/(app)/mentor-memory')}
            />
          </>
        ) : null}

        {/* 4. Family — conditional on profile owner */}
        {activeProfile?.isOwner && (
          <>
            <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
              Family
            </Text>
            {linkedChildren.length > 0 && (
              <SettingsRow
                label="Child progress"
                value={`${linkedChildren.length} ${
                  linkedChildren.length === 1 ? 'child' : 'children'
                }`}
                onPress={() =>
                  router.push('/(app)/dashboard?returnTo=more' as never)
                }
              />
            )}
            <Pressable
              onPress={handleAddChild}
              className="bg-surface rounded-card px-4 py-3.5 mb-2"
              accessibilityLabel="Add a child profile"
              accessibilityRole="button"
              testID="add-child-link"
            >
              <Text className="text-body font-semibold text-text-primary">
                Add a child
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                Create a profile so your child can learn with their own mentor
              </Text>
            </Pressable>
          </>
        )}

        {/* 5. Celebrations */}
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Celebrations
        </Text>
        <LearningModeOption
          title="All celebrations"
          description="Show every milestone, including quick wins"
          selected={celebrationLevel === 'all'}
          disabled={celebrationLoading || updateCelebrationLevel.isPending}
          onPress={() => {
            if (celebrationLevel !== 'all') {
              updateCelebrationLevel.mutate('all', {
                onError: () => {
                  platformAlert('Could not save setting', 'Please try again.');
                },
              });
            }
          }}
          testID="celebration-level-all"
        />
        <LearningModeOption
          title="Big milestones only"
          description="Keep Comet and Orion's Belt, skip the smaller pops"
          selected={celebrationLevel === 'big_only'}
          disabled={celebrationLoading || updateCelebrationLevel.isPending}
          onPress={() => {
            if (celebrationLevel !== 'big_only') {
              updateCelebrationLevel.mutate('big_only', {
                onError: () => {
                  platformAlert('Could not save setting', 'Please try again.');
                },
              });
            }
          }}
          testID="celebration-level-big-only"
        />
        <LearningModeOption
          title="Off"
          description="Track milestones quietly without animations"
          selected={celebrationLevel === 'off'}
          disabled={celebrationLoading || updateCelebrationLevel.isPending}
          onPress={() => {
            if (celebrationLevel !== 'off') {
              updateCelebrationLevel.mutate('off', {
                onError: () => {
                  platformAlert('Could not save setting', 'Please try again.');
                },
              });
            }
          }}
          testID="celebration-level-off"
        />

        {/* 6. Notifications */}
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Notifications
        </Text>
        <ToggleRow
          label="Push notifications"
          value={pushEnabled}
          onToggle={handleTogglePush}
          disabled={notifLoading || updateNotifications.isPending}
        />
        <ToggleRow
          label="Weekly progress digest"
          value={weeklyDigest}
          onToggle={handleToggleDigest}
          disabled={notifLoading || updateNotifications.isPending}
        />

        {/* 7. Account — identity, language, subscription only */}
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Account
        </Text>
        <SettingsRow
          label="Profile"
          value={displayName}
          onPress={() => router.push('/profiles')}
        />
        <AccountSecurity visible={activeProfile?.isOwner ?? false} />
        {/* BKT-C.1 — Tutor language edit path. Launches the same picker the */}
        {/* interview onboarding uses, with returnTo=settings so the picker's */}
        {/* onSave returns here instead of forward-routing into language-setup. */}
        <SettingsRow
          label="Tutor language"
          value={
            activeProfile?.conversationLanguage
              ? TUTOR_LANGUAGE_LABELS[activeProfile.conversationLanguage]
              : undefined
          }
          onPress={() =>
            router.push({
              pathname: '/(app)/onboarding/language-picker',
              params: { returnTo: 'settings' },
            })
          }
        />
        {/* [BUG-915] Hide Subscription in impersonation — billing is the
            parent account's, not the child profile's. */}
        {!isImpersonating && (
          <SettingsRow
            label="Subscription"
            value={
              subscription
                ? `${subscription.tier
                    .charAt(0)
                    .toUpperCase()}${subscription.tier.slice(1)}`
                : undefined
            }
            onPress={() => router.push('/(app)/subscription')}
            testID="more-row-subscription"
          />
        )}

        {/* 8. Other — support, legal, data management */}
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Other
        </Text>
        <SettingsRow label="Help & Support" onPress={() => void handleHelp()} />
        <SettingsRow label="Report a Problem" onPress={openFeedback} />
        <SettingsRow
          label="Privacy Policy"
          onPress={() => router.push('/privacy')}
        />
        <SettingsRow
          label="Terms of Service"
          onPress={() => router.push('/terms')}
        />
        {/* [BUG-915] Hide Export my data and Delete account in impersonation —
            both operate on the parent's underlying account. */}
        {!isImpersonating && (
          <SettingsRow
            label="Export my data"
            onPress={exportData.isPending ? undefined : handleExport}
            value={exportData.isPending ? 'Preparing export...' : undefined}
            testID="more-row-export"
          />
        )}
        {!isImpersonating && (
          <SettingsRow
            label="Delete account"
            onPress={() => router.push('/delete-account')}
            testID="more-row-delete-account"
          />
        )}

        {/* Homework Help — hidden until parent-controlled toggle is implemented
        <Pressable
          onPress={() => router.push('/(app)/homework/camera')}
          className="bg-surface rounded-card px-4 py-3.5 mb-2 mt-2"
          accessibilityLabel="Start homework help session"
          accessibilityRole="button"
          testID="homework-help-link"
        >
          <Text className="text-body font-semibold text-text-primary">
            Homework Help
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Snap a photo and get guided through it step by step
          </Text>
        </Pressable>
        */}

        {/* [BUG-915] Hide the Sign out button in impersonation — it would sign
            out the parent's whole account session, which the user (operating
            "as the child") almost certainly does not intend. The ProxyBanner
            at the top already provides the safe Switch-back path. */}
        {!isImpersonating && (
          <Pressable
            onPress={async () => {
              if (isSigningOut) return;
              setIsSigningOut(true);
              try {
                clearTransitionState();
                // [BUG-723 / SEC-7] Wipe per-profile + global SecureStore keys
                // before signing out so the next signed-in user on a shared
                // device does not inherit bookmark prompts, dictation prefs,
                // rating-prompt counters, etc. Includes all known profileIds
                // (owner + linked children) so child-profile keys are cleared
                // too. Best-effort: per-key failure is swallowed inside the
                // helper so cleanup never blocks sign-out.
                await clearProfileSecureStorageOnSignOut(
                  profiles.map((p) => p.id)
                );
                await signOut();
              } catch {
                platformAlert(
                  'Could not sign out',
                  'Please try again in a moment.'
                );
                setIsSigningOut(false);
              }
            }}
            disabled={isSigningOut}
            className={
              'bg-surface rounded-card px-4 py-3.5 mt-6 items-center' +
              (isSigningOut ? ' opacity-50' : '')
            }
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
            testID="sign-out-button"
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-danger">
              Sign out
            </Text>
          </Pressable>
        )}

        <View className="mt-8 items-center">
          <Text className="text-caption text-text-secondary">
            MentoMate v1.0.0
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
