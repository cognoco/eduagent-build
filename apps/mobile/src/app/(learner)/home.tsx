import { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoachingCard, AdaptiveEntryCard } from '../../components/coaching';
import { RetentionSignal } from '../../components/progress';
import {
  AnimatedEntry,
  ProfileSwitcher,
  PenWritingAnimation,
} from '../../components/common';
import { useProfile } from '../../lib/profile';
import { useSubjects } from '../../hooks/use-subjects';
import { useOverallProgress } from '../../hooks/use-progress';
import { useStreaks } from '../../hooks/use-streaks';
import { useCoachingCard } from '../../hooks/use-coaching-card';
import { useSubscriptionStatus } from '../../hooks/use-subscription';
import { useTheme, useThemeColors } from '../../lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const { data: overallProgress } = useOverallProgress();
  const { data: streak } = useStreaks();
  const firstSubjectId = subjects?.find((s) => s.status === 'active')?.id;
  const coachingCard = useCoachingCard(firstSubjectId);
  const { data: subStatus } = useSubscriptionStatus();
  const { persona } = useTheme();
  const themeColors = useThemeColors();
  const { profiles, activeProfile, switchProfile } = useProfile();

  // First-time user redirect: send users with no subjects to create-subject
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (
      !subjectsLoading &&
      subjects &&
      subjects.length === 0 &&
      !hasRedirected.current
    ) {
      hasRedirected.current = true;
      router.replace('/create-subject');
    }
  }, [subjectsLoading, subjects, router]);

  // Only show a gentle banner when the learner has hit their limit
  // Guard for monthlyLimit > 0: unlimited plans (limit=0) should never show this
  const isExceeded =
    subStatus !== undefined &&
    subStatus.monthlyLimit > 0 &&
    subStatus.usedThisMonth >= subStatus.monthlyLimit;

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
            {persona === 'teen'
              ? "What's on your mind?"
              : "Let's explore together!"}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {persona === 'teen'
              ? 'Your coach has ideas'
              : 'Your coach is ready'}
          </Text>
        </View>
        <View className="flex-row items-center" style={{ zIndex: 50 }}>
          {profiles.length > 1 && activeProfile && (
            <View className="me-2">
              <ProfileSwitcher
                profiles={profiles}
                activeProfileId={activeProfile.id}
                onSwitch={switchProfile}
              />
            </View>
          )}
          {streak && streak.currentStreak > 0 ? (
            <View
              testID="streak-badge"
              className="bg-surface-elevated rounded-full px-3 py-2 items-center justify-center"
            >
              <Text className="text-text-primary text-body-sm font-semibold">
                {streak.currentStreak}d
              </Text>
            </View>
          ) : (
            <View
              testID="streak-badge"
              className="bg-surface-elevated rounded-full w-11 h-11 items-center justify-center"
            >
              <Text className="text-text-secondary text-body-sm">0d</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="home-scroll-view"
      >
        {isExceeded && (
          <View
            className="bg-surface-elevated rounded-card px-4 py-3 mt-3"
            testID="exceeded-gentle-banner"
            accessibilityLabel="You've done great today! Let's continue tomorrow."
          >
            <Text className="text-body-sm text-text-secondary text-center">
              You've done great today! Let's continue tomorrow.
            </Text>
          </View>
        )}

        <AnimatedEntry>
          {coachingCard.isLoading ? (
            <View className="bg-coaching-card rounded-card p-5 mt-4 items-center py-8">
              <PenWritingAnimation size={100} color={themeColors.accent} />
            </View>
          ) : persona === 'teen' ? (
            <AdaptiveEntryCard
              headline={coachingCard.headline}
              subtext={coachingCard.subtext}
              actions={[
                {
                  label: 'Homework help',
                  onPress: () => {
                    router.push('/(learner)/homework/camera' as never);
                  },
                },
                {
                  label: 'Practice for a test',
                  onPress: () => {
                    if (coachingCard.primaryRoute) {
                      router.push(coachingCard.primaryRoute as never);
                    }
                  },
                },
                {
                  label: 'Just ask something',
                  onPress: () =>
                    router.push(
                      (firstSubjectId
                        ? `/(learner)/session?mode=freeform&subjectId=${firstSubjectId}`
                        : '/(learner)/session?mode=freeform') as never
                    ),
                },
              ]}
            />
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
        </AnimatedEntry>

        {/* Subject Retention Strip */}
        {!subjectsLoading && subjects && subjects.length > 0 && (
          <AnimatedEntry delay={100}>
            <View className="mt-4">
              <Text className="text-caption font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                Retention
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                testID="retention-strip"
              >
                {subjects.map((subject) => {
                  const status = subjectRetention.get(subject.id) ?? 'weak';
                  return (
                    <Pressable
                      key={subject.id}
                      onPress={() =>
                        router.push({
                          pathname: '/(learner)/book',
                          params: { subjectId: subject.id },
                        } as never)
                      }
                      className="bg-surface rounded-card px-3 py-2 flex-row items-center"
                      accessibilityLabel={`${subject.name}: retention ${status}`}
                      accessibilityRole="button"
                      testID={`retention-chip-${subject.id}`}
                    >
                      <RetentionSignal status={status} compact />
                      <Text className="text-body-sm text-text-primary ms-2 font-medium">
                        {subject.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </AnimatedEntry>
        )}

        <AnimatedEntry delay={200}>
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
                    <View
                      key={subject.id}
                      className="flex-row items-center bg-surface rounded-card px-4 py-3 mb-2"
                    >
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/(learner)/onboarding/curriculum-review',
                            params: { subjectId: subject.id },
                          } as never)
                        }
                        className="flex-1 flex-row items-center justify-between"
                        accessibilityLabel={`Open ${subject.name}`}
                        accessibilityRole="button"
                        testID={`home-subject-${subject.id}`}
                      >
                        <Text className="text-body font-medium text-text-primary">
                          {subject.name}
                        </Text>
                        <RetentionSignal
                          status={subjectRetention.get(subject.id) ?? 'strong'}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/(learner)/homework/camera',
                            params: {
                              subjectId: subject.id,
                              subjectName: subject.name,
                            },
                          } as never)
                        }
                        className="ms-3 bg-primary/10 rounded-button min-w-[40px] min-h-[40px] items-center justify-center"
                        accessibilityLabel={`Homework help for ${subject.name}`}
                        accessibilityRole="button"
                        testID={`homework-button-${subject.id}`}
                      >
                        <Text className="text-primary text-body">HW</Text>
                      </Pressable>
                    </View>
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
        </AnimatedEntry>
      </ScrollView>
    </View>
  );
}
