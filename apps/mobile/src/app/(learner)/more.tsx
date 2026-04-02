import { View, Text, Pressable, ScrollView, Switch, Alert } from 'react-native';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import type { LearningMode } from '@eduagent/schemas';
// COMMENTED OUT per BUG-9: accent picker removed (fixed brand decision)
// import { AccentPicker } from '../../components/common';
import { useProfile } from '../../lib/profile';
import { useExportData } from '../../hooks/use-account';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
  useLearningMode,
  useUpdateLearningMode,
  useCelebrationLevel,
  useUpdateCelebrationLevel,
} from '../../hooks/use-settings';
import { useSubscription } from '../../hooks/use-subscription';

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
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
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
    mode: 'serious',
    title: 'Serious Learner',
    description: 'Mastery gates, verified XP, full assessment cycle',
  },
  {
    mode: 'casual',
    title: 'Casual Explorer',
    description: 'No gates, completion XP, skip summaries freely',
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
  const { activeProfile } = useProfile();
  const exportData = useExportData();

  const { data: subscription } = useSubscription();
  const { data: notifPrefs, isLoading: notifLoading } =
    useNotificationSettings();
  const updateNotifications = useUpdateNotificationSettings();
  const { data: learningMode, isLoading: modeLoading } = useLearningMode();
  const updateLearningMode = useUpdateLearningMode();
  const { data: celebrationLevel, isLoading: celebrationLoading } =
    useCelebrationLevel();
  const updateCelebrationLevel = useUpdateCelebrationLevel();

  const pushEnabled = notifPrefs?.pushEnabled ?? false;
  const weeklyDigest = notifPrefs?.dailyReminders ?? false;

  const handleTogglePush = useCallback(
    (value: boolean) => {
      updateNotifications.mutate({
        reviewReminders: notifPrefs?.reviewReminders ?? false,
        dailyReminders: notifPrefs?.dailyReminders ?? false,
        pushEnabled: value,
      });
    },
    [updateNotifications, notifPrefs]
  );

  const handleToggleDigest = useCallback(
    (value: boolean) => {
      updateNotifications.mutate({
        reviewReminders: notifPrefs?.reviewReminders ?? false,
        dailyReminders: value,
        pushEnabled: notifPrefs?.pushEnabled ?? false,
      });
    },
    [updateNotifications, notifPrefs]
  );

  const handleSelectMode = useCallback(
    (mode: LearningMode) => {
      if (mode !== learningMode) {
        updateLearningMode.mutate(mode);
      }
    },
    [learningMode, updateLearningMode]
  );

  const handleExport = useCallback(async () => {
    try {
      await exportData.mutateAsync();
      Alert.alert('Export complete', 'Your data export is ready.');
    } catch {
      Alert.alert('Export failed', 'Please try again later.');
    }
  }, [exportData]);

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
              updateCelebrationLevel.mutate('all');
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
              updateCelebrationLevel.mutate('big_only');
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
              updateCelebrationLevel.mutate('off');
            }
          }}
          testID="celebration-level-off"
        />

        <Pressable
          onPress={() => router.push('/(learner)/homework/camera')}
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

        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Account
        </Text>
        <SettingsRow
          label="Profile"
          value={displayName}
          onPress={() => router.push('/profiles')}
        />
        <SettingsRow
          label="Subscription"
          value={
            subscription
              ? `${subscription.tier
                  .charAt(0)
                  .toUpperCase()}${subscription.tier.slice(1)}`
              : undefined
          }
          onPress={() => router.push('/(learner)/subscription')}
        />
        <SettingsRow label="Help & Support" />
        <SettingsRow
          label="Privacy Policy"
          onPress={() => router.push('/privacy')}
        />
        <SettingsRow
          label="Terms of Service"
          onPress={() => router.push('/terms')}
        />
        <SettingsRow label="Export my data" onPress={handleExport} />
        <SettingsRow
          label="Delete account"
          onPress={() => router.push('/delete-account')}
        />

        <Pressable
          onPress={async () => {
            await signOut();
          }}
          className="bg-surface rounded-card px-4 py-3.5 mt-6 items-center"
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
