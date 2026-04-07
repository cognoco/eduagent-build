import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile, isGuardianProfile } from '../lib/profile';
import {
  useSubscription,
  useFamilySubscription,
} from '../hooks/use-subscription';

export default function ProfilesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profiles, activeProfile, switchProfile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro'
  );
  const [isSwitching, setIsSwitching] = useState(false);

  const handleAddProfile = useCallback(() => {
    const tier = subscription?.tier;
    // Whitelist: only family/pro may add profiles. Blocks free, plus, and
    // undefined (query still loading or failed) — never fall through.
    if (tier !== 'family' && tier !== 'pro') {
      Alert.alert(
        'Upgrade required',
        'Adding profiles requires a Family or Pro subscription.',
        [
          {
            text: 'View plans',
            onPress: () => router.push('/(learner)/subscription'),
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
                onPress: () => router.push('/(learner)/subscription'),
              },
              { text: 'OK', style: 'cancel' },
            ]
          : [{ text: 'OK' }]
      );
      return;
    }

    router.push('/create-profile');
  }, [subscription, familyData, router]);

  const handleSwitch = async (profileId: string) => {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      const result = await switchProfile(profileId);
      if (result?.success === false) {
        Alert.alert(
          'Could not switch profiles',
          result.error ?? 'Please try again.'
        );
        return;
      }

      // Close modal AFTER a successful switch to avoid dismissing the screen
      // when the profile change did not actually complete.
      router.back();
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
          onPress={() => router.back()}
          className="min-h-[44px] min-w-[44px] items-center justify-center"
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
            onPress={handleAddProfile}
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
                    className="text-primary text-body font-semibold"
                    testID="profile-active-check"
                  >
                    ✓
                  </Text>
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
    </View>
  );
}
