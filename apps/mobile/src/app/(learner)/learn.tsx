import { useRouter } from 'expo-router';
import { LearnerScreen } from '../../components/home';

export default function LearnRoute(): React.ReactElement {
  const router = useRouter();

  return <LearnerScreen onBack={() => router.back()} />;
}
