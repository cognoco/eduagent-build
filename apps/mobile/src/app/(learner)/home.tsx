import { View } from 'react-native';
import { ParentGateway, LearnerScreen } from '../../components/home';
import { useCelebration } from '../../hooks/use-celebration';
import {
  useMarkCelebrationsSeen,
  usePendingCelebrations,
} from '../../hooks/use-celebrations';
import { useCelebrationLevel } from '../../hooks/use-settings';
import { useProfile } from '../../lib/profile';

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

export default function HomeScreen(): React.ReactElement {
  const { profiles, activeProfile } = useProfile();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const { data: pendingCelebrations } = usePendingCelebrations();
  const markCelebrationsSeen = useMarkCelebrationsSeen();
  const { CelebrationOverlay } = useCelebration({
    queue: pendingCelebrations ?? [],
    celebrationLevel,
    audience: activeProfile?.isOwner ? 'adult' : 'child',
    onAllComplete: () => {
      void markCelebrationsSeen.mutateAsync({ viewer: 'child' });
    },
  });

  return (
    <View className="flex-1">
      {hasLinkedChildren(activeProfile, profiles) ? (
        <ParentGateway />
      ) : (
        <LearnerScreen />
      )}
      {CelebrationOverlay}
    </View>
  );
}
