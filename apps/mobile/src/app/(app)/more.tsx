import {
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useState, useCallback } from 'react';
import * as SecureStore from '../../lib/secure-storage';
import { clearTransitionState } from '../../lib/auth-transition';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import type { KnowledgeInventory, LearningMode } from '@eduagent/schemas';
import { useProfile } from '../../lib/profile';
import { useQueryClient } from '@tanstack/react-query';
import { isNewLearner } from '../../lib/progressive-disclosure';
import { useExportData } from '../../hooks/use-account';
import { useFamilySubscription } from '../../hooks/use-subscription';
import { AccountSecurity } from '../../components/account-security';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
  useLearningMode,
  useUpdateLearningMode,
  useCelebrationLevel,
  useUpdateCelebrationLevel,
} from '../../hooks/use-settings';
import { useSubscription } from '../../hooks/use-subscription';
import { formatApiError } from '../../lib/format-api-error';

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
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
            Alert.alert(
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
            Alert.alert(
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
      if (mode !== learningMode) {
        updateLearningMode.mutate(mode, {
          onError: () => {
            Alert.alert('Could not save setting', 'Please try again.');
          },
        });
      }
    },
    [learningMode, updateLearningMode]
  );

  const handleExport = useCallback(async () => {
    try {
      const data = await exportData.mutateAsync();
      await Share.share({
        title: 'MentoMate account data export',
        message: JSON.stringify(data, null, 2),
      });
    } catch (err: unknown) {
      Alert.alert('Export failed', formatApiError(err));
    }
  }, [exportData]);

  const handleHelp = useCallback(async () => {
    try {
      await Linking.openURL(
        'mailto:support@mentomate.app?subject=MentoMate%20Support'
      );
    } catch {
      Alert.alert(
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
      Alert.alert(
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
      Alert.alert(
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
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-4">
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

        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Learning Mode
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
                  Alert.alert('Could not save setting', 'Please try again.');
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
                  Alert.alert('Could not save setting', 'Please try again.');
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
                  Alert.alert('Could not save setting', 'Please try again.');
                },
              });
            }
          }}
          testID="celebration-level-off"
        />

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
                onPress={() => router.push('/(app)/dashboard')}
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

        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Account
        </Text>
        <SettingsRow
          label="Profile"
          value={displayName}
          onPress={() => router.push('/profiles')}
        />
        {!hideMentorMemory ? (
          <SettingsRow
            label="What My Mentor Knows"
            onPress={() => router.push('/(app)/mentor-memory')}
          />
        ) : null}
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
        />
        <SettingsRow label="Help & Support" onPress={() => void handleHelp()} />
        <SettingsRow
          label="Privacy Policy"
          onPress={() => router.push('/privacy')}
        />
        <SettingsRow
          label="Terms of Service"
          onPress={() => router.push('/terms')}
        />
        <SettingsRow
          label="Export my data"
          onPress={exportData.isPending ? undefined : handleExport}
          value={exportData.isPending ? 'Preparing export...' : undefined}
        />
        <SettingsRow
          label="Delete account"
          onPress={() => router.push('/delete-account')}
        />

        <AccountSecurity />

        <Pressable
          onPress={async () => {
            if (isSigningOut) return;
            setIsSigningOut(true);
            try {
              clearTransitionState();
              void SecureStore.deleteItemAsync('hasSignedInBefore').catch(
                () => {
                  /* non-fatal */
                }
              );
              await signOut();
            } catch {
              Alert.alert(
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
          <Text className="text-body font-semibold text-danger">Sign out</Text>
        </Pressable>

        <View className="mt-8 items-center">
          <Text className="text-caption text-text-secondary">
            MentoMate v1.0.0
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
