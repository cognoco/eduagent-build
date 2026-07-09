import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useClerk, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../../../lib/profile';
import { signOutWithCleanup } from '../../../lib/sign-out';
import { platformAlert } from '../../../lib/platform-alert';
import { GateContent, LightBulbAnimation } from '../../../components/common';

/**
 * Gate shown when no profile exists yet (first-time user after sign-up).
 * Pushes to /create-profile as a modal so router.back() returns here
 * and the layout re-evaluates the guard with the newly created profile.
 */
export function CreateProfileGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
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
        clerkUserId: user?.id,
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
    router.push('/create-profile' as Href);
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
        <View className="items-center mb-8">
          <LightBulbAnimation size={120} testID="create-profile-gate-bulb" />
        </View>
        <Text className="text-h1 font-bold text-text-primary mb-3 text-center leading-tight">
          {t('tabs.createProfile.welcome')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-10">
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
