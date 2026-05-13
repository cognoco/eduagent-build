import { View } from 'react-native';

import { LearnerScreen } from '../../components/home';
import { OWN_LEARNING_RETURN_TO } from '../../lib/navigation';
import { useProfile } from '../../lib/profile';

export default function OwnLearningScreen(): React.ReactElement {
  const { activeProfile } = useProfile();

  return (
    <View className="flex-1">
      <LearnerScreen
        profiles={activeProfile ? [activeProfile] : []}
        activeProfile={activeProfile}
        showParentHome={false}
        returnToTab={OWN_LEARNING_RETURN_TO}
      />
    </View>
  );
}
