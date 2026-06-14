import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { LearnerScreen } from '../../components/home';
import { resolveTabShape } from '../../lib/legacy-navigation-contract';
import { OWN_LEARNING_RETURN_TO } from '../../lib/navigation';
import { useAppContext } from '../../lib/app-context';
import { isFamilyCapableProfile, useProfile } from '../../lib/profile';
import { useParentProxy } from '../../hooks/use-parent-proxy';

export default function OwnLearningScreen(): React.ReactElement {
  const { activeProfile, profiles } = useProfile();
  const { isParentProxy } = useParentProxy();
  const { mode, setMode } = useAppContext();
  const familyCapable = isFamilyCapableProfile(activeProfile, profiles);

  useEffect(() => {
    if (familyCapable && mode === 'family') {
      setMode('study');
    }
  }, [familyCapable, mode, setMode]);

  // [BUG-135] The (app)/_layout.tsx whitelist hides the own-learning TAB
  // BUTTON for the learner tab shape (solo owner or child-on-parent-account),
  // but a direct push, deep link, or push notification to /(app)/own-learning
  // still mounts this screen. Rendering the LearnerScreen "Own Learning" hub
  // for learners would double up on their default home and confuse the
  // navigation model — redirect them to /home, which is the canonical entry
  // for that shape. resolveTabShape() is the single source of truth for the
  // shape decision (see AGENTS.md > Profile Shapes).
  const tabShape = resolveTabShape({ activeProfile, profiles, isParentProxy });
  if (!familyCapable && tabShape !== 'guardian') {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <View className="flex-1">
      <LearnerScreen
        profiles={activeProfile ? [activeProfile] : []}
        activeProfile={activeProfile}
        returnToTab={OWN_LEARNING_RETURN_TO}
      />
    </View>
  );
}
