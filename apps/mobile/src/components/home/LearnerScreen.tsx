import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Profile } from '@eduagent/schemas';
import { ProfileSwitcher } from '../common';
import { useSubjects } from '../../hooks/use-subjects';
import { getGreeting } from '../../lib/greeting';
import { useThemeColors } from '../../lib/theme';
import { IntentCard } from './IntentCard';

export interface LearnerScreenProps {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (
    profileId: string
  ) => Promise<{ success: boolean; error?: string }>;
  onBack?: () => void;
}

export function LearnerScreen({
  profiles,
  activeProfile,
  switchProfile,
  onBack,
}: LearnerScreenProps): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: subjects } = useSubjects();
  const activeSubjects =
    subjects?.filter((subject) => subject.status === 'active') ?? [];
  const hasLibraryContent = activeSubjects.length > 0;
  const { title, subtitle } = getGreeting(activeProfile?.displayName ?? '');

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="learner-screen"
    >
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center flex-1 me-3">
          {onBack ? (
            <Pressable
              onPress={onBack}
              className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="learner-back"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
          ) : null}
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">{title}</Text>
            <Text className="text-body text-text-secondary mt-1">
              {subtitle}
            </Text>
          </View>
        </View>
        <ProfileSwitcher
          profiles={profiles}
          activeProfileId={activeProfile?.id ?? ''}
          onSwitch={switchProfile}
        />
      </View>

      <View className="gap-4">
        <IntentCard
          title="Learn something new!"
          onPress={() => router.push('/(learner)/learn-new' as never)}
          testID="intent-learn-new"
        />
        <IntentCard
          title="Help with assignment?"
          subtitle="Take a picture and we'll look at it together"
          onPress={() => router.push('/(learner)/homework/camera' as never)}
          testID="intent-homework"
        />
        {hasLibraryContent ? (
          <IntentCard
            title="Repeat & review"
            onPress={() => router.push('/(learner)/library' as never)}
            testID="intent-review"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
