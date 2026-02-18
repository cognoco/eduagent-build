import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoachingCard } from '../../components/coaching';
import { RetentionSignal } from '../../components/progress';
import { useSubjects } from '../../hooks/use-subjects';
import { useOverallProgress } from '../../hooks/use-progress';
import { useStreaks } from '../../hooks/use-streaks';
import { useCoachingCard } from '../../hooks/use-coaching-card';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const { data: overallProgress } = useOverallProgress();
  const { data: streak } = useStreaks();
  const coachingCard = useCoachingCard();

  // Build a lookup of retention status per subject from overall progress
  const subjectRetention = new Map<string, 'strong' | 'fading' | 'weak'>();
  if (overallProgress?.subjects) {
    for (const sp of overallProgress.subjects) {
      subjectRetention.set(sp.subjectId, sp.retentionStatus);
    }
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row justify-between items-center">
        <View>
          <Text className="text-h1 font-bold text-text-primary">
            Ready to learn
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Your coach has a plan
          </Text>
        </View>
        {streak && streak.currentStreak > 0 ? (
          <View className="bg-surface-elevated rounded-full px-3 py-2 items-center justify-center">
            <Text className="text-text-primary text-body-sm font-semibold">
              {streak.currentStreak}d
            </Text>
          </View>
        ) : (
          <View className="bg-surface-elevated rounded-full w-11 h-11 items-center justify-center">
            <Text className="text-text-secondary text-body-sm">0d</Text>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {coachingCard.isLoading ? (
          <View className="bg-coaching-card rounded-card p-5 mt-4 items-center py-8">
            <ActivityIndicator />
          </View>
        ) : (
          <CoachingCard
            headline={coachingCard.headline}
            subtext={coachingCard.subtext}
            primaryLabel={coachingCard.primaryLabel}
            secondaryLabel={coachingCard.secondaryLabel}
            onPrimary={() => {
              if (coachingCard.primaryRoute) {
                router.push(coachingCard.primaryRoute as never);
              }
            }}
            onSecondary={() => {
              if (coachingCard.secondaryRoute) {
                router.push(coachingCard.secondaryRoute as never);
              }
            }}
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
            <>
              {subjects.map(
                (subject: { id: string; name: string; status: string }) => (
                  <Pressable
                    key={subject.id}
                    onPress={() =>
                      router.push(
                        `/(learner)/curriculum/${subject.id}` as never
                      )
                    }
                    className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                    accessibilityLabel={`Open ${subject.name}`}
                    accessibilityRole="button"
                  >
                    <Text className="text-body font-medium text-text-primary">
                      {subject.name}
                    </Text>
                    <RetentionSignal
                      status={subjectRetention.get(subject.id) ?? 'strong'}
                    />
                  </Pressable>
                )
              )}
              <Pressable
                onPress={() => router.push('/create-subject')}
                className="bg-primary rounded-button py-3 mt-4 items-center"
                testID="add-subject-button"
                accessibilityLabel="Add subject"
                accessibilityRole="button"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Add subject
                </Text>
              </Pressable>
            </>
          ) : (
            <View className="bg-surface rounded-card px-4 py-6 items-center">
              <Text className="text-body text-text-secondary">
                Start learning — add your first subject
              </Text>
              <Pressable
                onPress={() => router.push('/create-subject')}
                className="bg-primary rounded-button py-3 mt-4 items-center w-full"
                testID="add-subject-button"
                accessibilityLabel="Add subject"
                accessibilityRole="button"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  Add subject
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
