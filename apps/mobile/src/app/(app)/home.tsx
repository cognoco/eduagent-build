import { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ParentGateway, LearnerScreen } from '../../components/home';
import { useCelebration } from '../../hooks/use-celebration';
import {
  useMarkCelebrationsSeen,
  usePendingCelebrations,
} from '../../hooks/use-celebrations';
import { useCelebrationLevel } from '../../hooks/use-settings';
import { useSubscription } from '../../hooks/use-subscription';
import { useProfile } from '../../lib/profile';

/** True when the active user is the account owner AND has at least one child profile. */
function hasLinkedChildren(
  activeProfile: { id: string; isOwner: boolean } | null,
  profiles: ReadonlyArray<{ id: string; isOwner: boolean }>
): boolean {
  return (
    activeProfile?.isOwner === true &&
    profiles.some(
      (profile) => profile.id !== activeProfile.id && !profile.isOwner
    )
  );
}

/**
 * Shown when an owner is on a family/pro plan but has not yet added a child
 * profile. Gives them a clear CTA to add their first child instead of
 * dropping them into the solo-learner flow.
 */
function AddFirstChildScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="add-first-child-screen"
    >
      <Text className="text-h2 font-bold text-text-primary text-center mb-3">
        Add your first child
      </Text>
      <Text className="text-body text-text-secondary text-center mb-8">
        Create a child profile to start tracking their progress and learning
        sessions.
      </Text>
      <Pressable
        onPress={() => router.push('/create-profile' as never)}
        className="bg-primary rounded-button px-8 py-3.5 items-center w-full"
        style={{ minHeight: 48 }}
        accessibilityRole="button"
        accessibilityLabel="Add a child profile"
        testID="add-first-child-cta"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Add Child Profile
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen(): React.ReactElement {
  const { profiles, activeProfile, switchProfile, isLoading } = useProfile();
  const { data: subscription } = useSubscription();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const { data: pendingCelebrations } = usePendingCelebrations();
  const markCelebrationsSeen = useMarkCelebrationsSeen();
  const isOwner = activeProfile?.isOwner === true;
  const { CelebrationOverlay } = useCelebration({
    queue: pendingCelebrations ?? [],
    celebrationLevel,
    audience: isOwner ? 'adult' : 'child',
    onAllComplete: () => {
      void markCelebrationsSeen.mutateAsync({
        viewer: isOwner ? 'parent' : 'child',
      });
    },
  });

  // BUG-306: Add timeout so the loading spinner doesn't hang forever
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Neutral placeholder while profiles load — prevents flash of wrong content
  // (e.g. parent briefly seeing LearnerScreen before ParentGateway renders).
  if (isLoading && !loadingTimedOut) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (loadingTimedOut) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        testID="home-loading-timeout"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          Taking longer than expected. Please check your connection and try
          again.
        </Text>
        <Pressable
          onPress={() => setLoadingTimedOut(false)}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Retry loading"
          testID="home-loading-retry"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const showParentGateway = hasLinkedChildren(activeProfile, profiles);
  // Guard against subscription still loading (undefined) — treat as
  // indeterminate so family/pro owners don't flash LearnerScreen. [CR-fix-6]
  const supportsMultipleProfiles =
    subscription != null &&
    (subscription.tier === 'family' || subscription.tier === 'pro');

  // Only multi-profile plans should see the add-child CTA. Free/Plus owners are
  // solo learners, so routing them away from LearnerScreen hides core flows.
  // Also indeterminate while subscription is loading (subscription == null).
  const isParentWithNoChildren =
    subscription != null &&
    isOwner &&
    !showParentGateway &&
    supportsMultipleProfiles;

  return (
    <View className="flex-1">
      {showParentGateway ? (
        <ParentGateway
          profiles={profiles}
          activeProfile={activeProfile}
          switchProfile={switchProfile}
        />
      ) : isParentWithNoChildren ? (
        <AddFirstChildScreen />
      ) : (
        <LearnerScreen
          profiles={profiles}
          activeProfile={activeProfile}
          switchProfile={switchProfile}
        />
      )}
      {CelebrationOverlay}
    </View>
  );
}
