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
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import {
  useProfile,
  isGuardianProfile,
  type SwitchProfileOptions,
} from '../lib/profile';
import { useAppContext } from '../lib/app-context';
import { childProfileHref, goBackOrReplace } from '../lib/navigation';
import { useThemeColors } from '../lib/theme';
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
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { isLoaded, isSignedIn } = useAuth();
  const { profiles, activeProfile, switchProfile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const updateName = useUpdateProfileName();
  const [renaming, setRenaming] = useState<{
    profileId: string;
    currentName: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<TextInput>(null);
  const switchInFlightRef = useRef(false);
  const { setMode } = useAppContext();

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
    [],
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
      },
    );
  }, [renaming, renameValue, updateName, handleCancelRename]);

  const handleClose = useCallback(() => {
    goBackOrReplace(router, '/(app)/home');
  }, [router]);

  const handleAddProfile = useCallback(() => {
    router.push('/create-profile');
  }, [router]);

  // UX-DE-L13: timeout on profile switch
  //
  // [BUG-133] The client-side `profiles[]` array used by this screen (and by
  // handleProfileTap below) is a UX hint only. The authoritative ownership
  // check lives server-side in `POST /v1/profiles/switch` (see
  // `lib/profile.ts#switchProfile`), which rejects any profileId not linked
  // to the signed-in account. If a tampered client passed an unrelated
  // profileId here, switchProfile would return `{success:false}` and the
  // alert path below would surface the typed server error. We therefore do
  // NOT add a redundant client-side ownership guard — doing so would be
  // false reassurance about security and would mask a real server-side
  // regression behind a green client check.
  const handleSwitch = async (
    profileId: string,
    options?: SwitchProfileOptions,
  ) => {
    if (isSwitching || switchInFlightRef.current) return;
    switchInFlightRef.current = true;
    setIsSwitching(true);
    // [CR-2026-05-21-107] Track whether the 20s "taking longer" alert has
    // already fired. The setTimeout only resets isSwitching — it cannot
    // cancel the in-flight switchProfile(). When the request resolves
    // *after* the timeout, the success path would call handleClose() and
    // (in the persistenceFailed branch) a second alert — both on top of
    // the "Please try again" the user already saw. Guard the post-await
    // continuation with this ref so the late resolve is a silent no-op.
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      switchInFlightRef.current = false;
      setIsSwitching(false);
      platformAlert('Taking longer than expected', 'Please try again.');
    }, 20_000);
    try {
      const result =
        options !== undefined
          ? await switchProfile(profileId, options)
          : await switchProfile(profileId);
      clearTimeout(timeoutId);
      if (timedOut) {
        // User already saw "Please try again"; do not stack a second alert
        // or close the modal underneath them. If the switch actually
        // succeeded server-side, the next render of the profiles screen
        // will reflect the new active profile via useProfile() — no UX
        // step needed here.
        return;
      }
      if (result?.success === false) {
        platformAlert(
          'Could not switch profiles',
          result.error ?? 'Please try again.',
        );
        return;
      }

      // Close modal AFTER a successful switch to avoid dismissing the screen
      // when the profile change did not actually complete.
      handleClose();
      if (result?.persistenceFailed) {
        platformAlert(
          'Profile switched',
          'We could not save this profile choice on this device. You may need to pick it again after reopening the app.',
        );
      }
    } catch (err) {
      // [BUG-822] switchProfile may throw (network failure, Clerk error, etc.)
      // instead of returning {success:false}. Surface the typed server reason
      // when available rather than a generic "Please try again." per AGENTS.md
      // rule: never replace specific server errors with generic messages.
      clearTimeout(timeoutId);
      // [CR-2026-05-21-107] Same guard as the success path — if the 20s
      // alert already fired, do not stack a second error dialog over it.
      if (timedOut) return;
      platformAlert('Could not switch profiles', formatApiError(err));
    } finally {
      clearTimeout(timeoutId);
      switchInFlightRef.current = false;
      setIsSwitching(false);
    }
  };

  const handleProfileTap = (profile: (typeof profiles)[number]) => {
    if (activeProfile?.isOwner && !profile.isOwner) {
      setMode('family');
      // [BUG-774] /profiles is a root-level fullScreenModal (see _layout.tsx).
      // `router.replace` from inside that modal swaps the modal route in place
      // but never dismisses the modal stack, so the child-settings screen
      // never mounts and the user stays staring at /profiles. Use the
      // documented Expo Router modal-dismiss API (`router.dismiss`) to drop
      // back to the underlying /(app) stack, then push the child-settings
      // target so the deep route lands in the correct stack and back-nav
      // from settings returns to the parent shell rather than re-opening
      // the profiles modal. `router.dismiss` is the documented dismiss
      // strategy required by screen-navigation.test.ts (`[BUG-BACK-RATCHET]`).
      if (router.canDismiss?.()) {
        router.dismiss();
      }
      router.push(childProfileHref(profile.id, 'settings'));
      return;
    }

    void handleSwitch(profile.id);
  };

  // [BUG-375] Auth gate — deep-link entry must not show profile data to
  // unauthenticated users. Guard before rendering any profile content.
  if (!isLoaded) {
    return (
      <View
        testID="profiles-auth-loading"
        className="flex-1 bg-background items-center justify-center"
      >
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="profiles-screen"
    >
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">
          {t('profiles.title')}
        </Text>
        <Pressable
          onPress={handleClose}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          testID="profiles-close"
        >
          <Text className="text-body text-primary font-semibold">
            {t('common.done')}
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            size="large"
            testID="profiles-loading"
            accessibilityLabel={t('common.loading')}
          />
        </View>
      ) : profiles.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-h2 font-bold text-text-primary mb-2">
            {t('profiles.noProfilesYet')}
          </Text>
          <Text className="text-body text-text-secondary text-center mb-6">
            {t('profiles.createFirstHint')}
          </Text>
          <Pressable
            onPress={() => router.push('/create-profile')}
            className="bg-primary rounded-button px-6 py-3"
            testID="profiles-create-first"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('profiles.createProfile')}
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
              : 'Learner';

            return (
              <Pressable
                key={profile.id}
                onPress={() => handleProfileTap(profile)}
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
                      {t('common.edit')}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}

          {/*
            [BUG-127] isOwner client-side gate. Per AGENTS.md Profile Shapes,
            "Add child" must only be visible to account owners (guardian or
            solo) — children acting on a parent's account must never see the
            add-profile affordance. Server-side enforcement remains the
            source of truth, but the button must not even render for
            non-owners.
          */}
          {activeProfile?.isOwner && (
            <Pressable
              onPress={handleAddProfile}
              className="flex-row items-center justify-center bg-surface rounded-card px-4 py-3.5 mt-4"
              testID="profiles-add-button"
            >
              <Text className="text-body font-semibold text-primary">
                {t('profiles.addProfile')}
              </Text>
            </Pressable>
          )}
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
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable
              onPress={() => {
                /* prevent dismiss when tapping inside */
              }}
              className="bg-surface rounded-card p-5"
            >
              <Text className="text-h2 font-bold text-text-primary mb-4">
                {t('profiles.renameTitle')}
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
                placeholderTextColor={colors.muted}
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
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text className="text-body text-text-secondary">
                    {t('common.cancel')}
                  </Text>
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
                    {updateName.isPending
                      ? t('common.saving')
                      : t('common.save')}
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
