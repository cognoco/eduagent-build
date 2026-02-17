import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { CoachingCard } from '../../components/CoachingCard';
import { RetentionSignal } from '../../components/RetentionSignal';
import { useSubjects } from '../../hooks/use-subjects';

export default function HomeScreen() {
  const { persona, setPersona } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row justify-between items-center">
        <View>
          <Text className="text-h1 font-bold text-text-primary">
            {persona === 'learner' ? 'Ready to learn' : 'Hey there'}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Your coach has a plan
          </Text>
        </View>
        <Pressable
          onPress={() =>
            setPersona(
              persona === 'teen'
                ? 'learner'
                : persona === 'learner'
                ? 'parent'
                : 'teen'
            )
          }
          className="bg-surface-elevated rounded-full w-10 h-10 items-center justify-center"
        >
          <Text className="text-text-primary text-body font-semibold">
            {persona === 'teen' ? 'T' : persona === 'learner' ? 'L' : 'P'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {persona === 'teen' ? (
          <CoachingCard
            headline="Ready for homework?"
            subtext="You've got algebra and science due tomorrow."
            primaryLabel="Take photo"
            secondaryLabel="Something else"
            onPrimary={() => router.push('/chat?mode=homework')}
            onSecondary={() => router.push('/chat?mode=freeform')}
          />
        ) : (
          <CoachingCard
            headline="Electromagnetic forces are fading."
            subtext="90-second refresh to lock it in."
            primaryLabel="Let's go"
            secondaryLabel="I have something else in mind"
            onPrimary={() => router.push('/chat?mode=practice')}
            onSecondary={() => router.push('/chat?mode=freeform')}
          />
        )}

        <View className="mt-6">
          <Text className="text-h3 font-semibold text-text-primary mb-3">
            Your subjects
          </Text>
          {subjectsLoading ? (
            <View className="py-4 items-center">
              <ActivityIndicator />
            </View>
          ) : subjects && subjects.length > 0 ? (
            subjects.map(
              (subject: { id: string; name: string; status: string }) => (
                <View
                  key={subject.id}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                >
                  <Text className="text-body font-medium text-text-primary">
                    {subject.name}
                  </Text>
                  <RetentionSignal status="strong" />
                </View>
              )
            )
          ) : (
            <View className="bg-surface rounded-card px-4 py-6 items-center">
              <Text className="text-body text-text-secondary">
                Start learning — add your first subject
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
