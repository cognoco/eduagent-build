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
  UsageMeter,
} from '../../components/common';
import { useProfile } from '../../lib/profile';
import { useSubjects } from '../../hooks/use-subjects';
import { useOverallProgress } from '../../hooks/use-progress';
import { useStreaks } from '../../hooks/use-streaks';
import { useCoachingCard } from '../../hooks/use-coaching-card';
import {
  useSubscriptionStatus,
  type WarningLevel,
} from '../../hooks/use-subscription';
import { useTheme } from '../../lib/theme';

/** Client-side warning level — mirrors server's getWarningLevel logic */
function getWarningLevel(used: number, limit: number): WarningLevel {
  if (limit <= 0) return 'exceeded';
  const ratio = used / limit;
  if (ratio >= 1) return 'exceeded';
  if (ratio >= 0.95) return 'hard';
  if (ratio >= 0.8) return 'soft';
  return 'none';
}

const WARNING_MESSAGES: Record<Exclude<WarningLevel, 'none'>, string> = {
  soft: "You're approaching your monthly limit",
  hard: 'questions remaining this month',
  exceeded: 'Monthly limit reached — upgrade or buy top-up credits',
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const { data: overallProgress } = useOverallProgress();
  const { data: streak } = useStreaks();
  const coachingCard = useCoachingCard();
  const { data: subStatus } = useSubscriptionStatus();
  const { persona } = useTheme();
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

  // Compute warning level and remaining questions from subscription status
  const warningLevel: WarningLevel = subStatus
    ? getWarningLevel(subStatus.usedThisMonth, subStatus.monthlyLimit)
    : 'none';
  const remaining = subStatus
    ? Math.max(0, subStatus.monthlyLimit - subStatus.usedThisMonth)
    : 0;

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
        <View className="flex-row items-center" style={{ zIndex: 50 }}>
          {profiles.length > 1 && activeProfile && (
            <View className="mr-2">
              <ProfileSwitcher
                profiles={profiles}
                activeProfileId={activeProfile.id}
                onSwitch={switchProfile}
              />
            </View>
          )}
          {subStatus && (
            <Pressable
              onPress={() => router.push('/(learner)/subscription')}
              className="bg-primary-soft rounded-full px-2.5 py-1.5 mr-2"
              accessibilityLabel={`${remaining} questions remaining`}
              accessibilityRole="button"
              testID="header-quota-badge"
            >
              <Text className="text-primary text-caption font-semibold">
                {remaining}Q
              </Text>
            </Pressable>
          )}
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
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="home-scroll-view"
      >
        {subStatus && (
          <View className="mt-3" testID="usage-display">
            <UsageMeter
              used={subStatus.usedThisMonth}
              limit={subStatus.monthlyLimit}
              warningLevel={warningLevel}
            />
            {warningLevel === 'hard' && (
              <Pressable
                onPress={() => router.push('/(learner)/subscription')}
                className="bg-warning/10 rounded-card px-4 py-2.5 mt-2"
                accessibilityLabel={`${remaining} ${WARNING_MESSAGES.hard}`}
                accessibilityRole="button"
                testID="quota-warning-hard"
              >
                <Text className="text-caption text-warning font-semibold">
                  {remaining} {WARNING_MESSAGES.hard}
                </Text>
              </Pressable>
            )}
            {warningLevel === 'soft' && (
              <View
                className="bg-retention-fading/10 rounded-card px-4 py-2.5 mt-2"
                accessibilityLabel={WARNING_MESSAGES.soft}
                testID="quota-warning-soft"
              >
                <Text className="text-caption text-retention-fading font-medium">
                  {WARNING_MESSAGES.soft}
                </Text>
              </View>
            )}
            {warningLevel === 'exceeded' && (
              <Pressable
                onPress={() => router.push('/(learner)/subscription')}
                className="bg-danger/10 rounded-card px-4 py-2.5 mt-2"
                accessibilityLabel={WARNING_MESSAGES.exceeded}
                accessibilityRole="button"
                testID="quota-warning-exceeded"
              >
                <Text className="text-caption text-danger font-semibold">
                  {WARNING_MESSAGES.exceeded}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <AnimatedEntry>
          {coachingCard.isLoading ? (
            <View className="bg-coaching-card rounded-card p-5 mt-4 items-center py-8">
              <ActivityIndicator />
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
                    router.push('/(learner)/session?mode=freeform' as never),
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
                      <Text className="text-body-sm text-text-primary ml-2 font-medium">
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
                        className="ml-3 bg-primary/10 rounded-button min-w-[40px] min-h-[40px] items-center justify-center"
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
