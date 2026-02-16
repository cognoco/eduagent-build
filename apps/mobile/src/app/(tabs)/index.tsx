import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { CoachingCard } from '../../components/CoachingCard';
import { DashboardCard } from '../../components/DashboardCard';
import { RetentionSignal } from '../../components/RetentionSignal';

export default function HomeScreen() {
  const { persona, setPersona } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (persona === 'parent') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="px-5 pt-4 pb-2">
          <Text className="text-h1 font-bold text-text-primary">Dashboard</Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            How your children are doing
          </Text>
        </View>
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <DashboardCard
            name="Alex"
            summary="Math — 5 problems, 3 guided. Science fading."
            sessions={4}
            lastWeekSessions={2}
            subjects={[
              { name: 'Math', retention: 'strong' as const },
              { name: 'Science', retention: 'fading' as const },
              { name: 'English', retention: 'strong' as const },
            ]}
          />
          <DashboardCard
            name="Emma"
            summary="All subjects on track, all guided."
            sessions={6}
            lastWeekSessions={6}
            subjects={[
              { name: 'Math', retention: 'strong' as const },
              { name: 'History', retention: 'strong' as const },
            ]}
          />

          <Pressable
            onPress={() => setPersona('teen')}
            className="mt-6 items-center py-3"
          >
            <Text className="text-body-sm text-text-secondary underline">
              Switch to Teen view (demo)
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

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
          {[
            { name: 'Math', retention: 'strong' as const },
            { name: 'Science', retention: 'fading' as const },
            { name: 'English', retention: 'strong' as const },
            { name: 'History', retention: 'weak' as const },
          ].map((subject) => (
            <View
              key={subject.name}
              className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
            >
              <Text className="text-body font-medium text-text-primary">
                {subject.name}
              </Text>
              <RetentionSignal status={subject.retention} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
