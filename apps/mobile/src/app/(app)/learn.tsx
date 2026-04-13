import { useRouter } from 'expo-router';
import { LearnerScreen } from '../../components/home';
import { useProfile } from '../../lib/profile';
import { goBackOrReplace } from '../../lib/navigation';

export default function LearnRoute(): React.ReactElement {
  const router = useRouter();
  const { profiles, activeProfile, switchProfile } = useProfile();

  return (
    <LearnerScreen
      profiles={profiles}
      activeProfile={activeProfile}
      switchProfile={switchProfile}
      onBack={() => goBackOrReplace(router, '/(app)/home' as const)}
    />
  );
}
