import { View, ActivityIndicator } from 'react-native';
// import { ParentGateway } from '../../components/home'; // commented out — unreachable while _layout.tsx redirects parents (PR109-03)
import { LearnerScreen } from '../../components/home';
import { useCelebration } from '../../hooks/use-celebration';
import {
  useMarkCelebrationsSeen,
  usePendingCelebrations,
} from '../../hooks/use-celebrations';
import { useCelebrationLevel } from '../../hooks/use-settings';
import { useProfile } from '../../lib/profile';

// ParentGateway routing — commented out while _layout.tsx redirects all parents
// to /(parent)/dashboard before this screen renders (PR109-03).
// Uncomment when the adaptive home screen is re-enabled for parent accounts.
// function hasLinkedChildren(
//   activeProfile: { id: string; isOwner: boolean } | null,
//   profiles: ReadonlyArray<{ id: string; isOwner: boolean }>
// ): boolean {
//   return (
//     activeProfile?.isOwner === true &&
//     profiles.some(
//       (profile) => profile.id !== activeProfile.id && !profile.isOwner
//     )
//   );
// }

export default function HomeScreen(): React.ReactElement {
  const { profiles, activeProfile, switchProfile, isLoading } = useProfile();
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

  // Neutral placeholder while profiles load — prevents flash of wrong content
  // (e.g. parent briefly seeing LearnerScreen before ParentGateway renders).
  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* ParentGateway branch commented out — see PR109-03 */}
      <LearnerScreen
        profiles={profiles}
        activeProfile={activeProfile}
        switchProfile={switchProfile}
      />
      {CelebrationOverlay}
    </View>
  );
}
