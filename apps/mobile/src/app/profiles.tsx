import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile, isGuardianProfile } from '../lib/profile';
import { goBackOrReplace } from '../lib/navigation';
import {
  useSubscription,
  useFamilySubscription,
} from '../hooks/use-subscription';
import { useUpdateProfileName } from '../hooks/use-profiles';
import { platformAlert } from '../lib/platform-alert';
import { formatApiError } from '../lib/format-api-error';

export default function ProfilesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profiles, activeProfile, switchProfile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro'
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const updateName = useUpdateProfileName();
  const [renaming, setRenaming] = useState<{
    profileId: string;
    currentName: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<TextInput>(null);

  const canEditProfile = (profileId: string) => {
    if (!activeProfile) return false;
    // Owner can rename any profile; non-owner can only rename themselves
    if (activeProfile.isOwner) return true;
    return profileId === activeProfile.id;
  };

  const handleStartRename = useCallback(
    (profileId: string, currentName: string) => {
      setRenaming({ profileId, currentName });
      setRenameValue(currentName);
    },
    []
  );

  const handleCancelRename = useCallback(() => {
    setRenaming(null);
    setRenameValue('');
  }, []);

  const handleSaveRename = useCallback(() => {
    if (!renaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renaming.currentName) {
      handleCancelRename();
      return;
    }
    updateName.mutate(
      { profileId: renaming.profileId, displayName: trimmed },
      {
        onSuccess: () => {
          setRenaming(null);
          setRenameValue('');
        },
        onError: (err) => {
          platformAlert('Could not rename profile', formatApiError(err));
        },
      }
    );
  }, [renaming, renameValue, updateName, handleCancelRename]);

  const handleClose = useCallback(() => {
    goBackOrReplace(router, '/(app)/home');
  }, [router]);

  const handleAddProfile = useCallback(() => {
    if (!subscription) {
      // Query still loading — don't block with a false 'Upgrade required'
      return;
    }

    // BUG-287: Always allow creating the first child profile (the owner profile
    // is always profile #1, so profiles.length === 1 means no children yet).
    // New users should never be blocked from adding their first child.
    const hasNoChildren = profiles.length <= 1;

    const tier = subscription.tier;
    // Whitelist: only family/pro may add profiles. Blocks free and plus.
    // Exception: first child profile is always allowed regardless of tier.
    if (!hasNoChildren && tier !== 'family' && tier !== 'pro') {
      platformAlert(
        'Upgrade required',
        'Adding more profiles requires a Family or Pro subscription.',
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
  }, [subscription, familyData, router, profiles.length]);

  const handleSwitch = async (profileId: string) => {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      const result = await switchProfile(profileId);
      if (result?.success === false) {
        platformAlert(
          'Could not switch profiles',
          result.error ?? 'Please try again.'
        );
        return;
      }

      // Close modal AFTER a successful switch to avoid dismissing the screen
      // when the profile change did not actually complete.
      handleClose();
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="profiles-screen"
    >
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">Profiles</Text>
        <Pressable
          onPress={handleClose}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Done"
          testID="profiles-close"
        >
          <Text className="text-body text-primary font-semibold">Done</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" testID="profiles-loading" />
        </View>
      ) : profiles.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-h2 font-bold text-text-primary mb-2">
            No profiles yet
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            Create your first profile to get started
          </Text>
          <Pressable
            onPress={() => router.push('/create-profile')}
            className="bg-primary rounded-button px-6 py-3"
            testID="profiles-create-first"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Create profile
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfile?.id;
            const initial = profile.displayName.charAt(0).toUpperCase();
            const roleLabel = isGuardianProfile(profile, profiles)
              ? 'Parent'
              : 'Student';

            return (
              <Pressable
                key={profile.id}
                onPress={() => handleSwitch(profile.id)}
                disabled={isSwitching}
                className="flex-row items-center bg-surface rounded-card px-4 py-3.5 mb-2"
                style={isSwitching ? { opacity: 0.6 } : undefined}
                testID={`profile-row-${profile.id}`}
              >
                <View className="w-10 h-10 rounded-full bg-primary items-center justify-center me-3">
                  <Text className="text-body font-bold text-text-inverse">
                    {initial}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-body font-semibold text-text-primary">
                    {profile.displayName}
                  </Text>
                  <Text className="text-body-sm text-text-secondary">
                    {roleLabel}
                  </Text>
                </View>
                {isActive && (
                  <Text
                    className="text-primary text-body font-semibold me-2"
                    testID="profile-active-check"
                  >
                    ✓
                  </Text>
                )}
                {canEditProfile(profile.id) && (
                  <Pressable
                    onPress={() =>
                      handleStartRename(profile.id, profile.displayName)
                    }
                    hitSlop={8}
                    className="min-h-[44px] min-w-[44px] items-center justify-center"
                    accessibilityLabel={`Rename ${profile.displayName}`}
                    accessibilityRole="button"
                    testID={`profile-rename-${profile.id}`}
                  >
                    <Text className="text-body-sm text-text-secondary">
                      Edit
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}

          <Pressable
            onPress={handleAddProfile}
            className="flex-row items-center justify-center bg-surface rounded-card px-4 py-3.5 mt-4"
            testID="profiles-add-button"
          >
            <Text className="text-body font-semibold text-primary">
              + Add profile
            </Text>
          </Pressable>
        </ScrollView>
      )}
      <Modal
        visible={renaming !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancelRename}
        testID="rename-modal"
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center px-8"
          onPress={handleCancelRename}
          accessibilityRole="none"
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              onPress={() => {
                /* prevent dismiss when tapping inside */
              }}
              className="bg-surface rounded-card p-5"
            >
              <Text className="text-h2 font-bold text-text-primary mb-4">
                Rename profile
              </Text>
              <TextInput
                ref={renameInputRef}
                value={renameValue}
                onChangeText={setRenameValue}
                onSubmitEditing={handleSaveRename}
                maxLength={50}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                className="bg-background rounded-card px-4 py-3 text-body text-text-primary mb-4"
                placeholderTextColor="#999"
                placeholder="Name"
                testID="rename-input"
                accessibilityLabel="Profile name"
              />
              <View className="flex-row justify-end gap-3">
                <Pressable
                  onPress={handleCancelRename}
                  className="px-4 py-2"
                  testID="rename-cancel"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text className="text-body text-text-secondary">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveRename}
                  disabled={
                    updateName.isPending ||
                    !renameValue.trim() ||
                    renameValue.trim() === renaming?.currentName
                  }
                  className={`bg-primary rounded-button px-5 py-2 ${
                    updateName.isPending ||
                    !renameValue.trim() ||
                    renameValue.trim() === renaming?.currentName
                      ? 'opacity-50'
                      : ''
                  }`}
                  testID="rename-save"
                  accessibilityRole="button"
                  accessibilityLabel="Save"
                >
                  <Text className="text-body font-semibold text-text-inverse">
                    {updateName.isPending ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
