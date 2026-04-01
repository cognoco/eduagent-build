import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoachingCard, AdaptiveEntryCard } from '../../components/coaching';
import { RetentionSignal } from '../../components/progress';
import {
  AnimatedEntry,
  ApiUnreachableBanner,
  ProfileSwitcher,
  PenWritingAnimation,
} from '../../components/common';
import { useCelebration } from '../../hooks/use-celebration';
import {
  useMarkCelebrationsSeen,
  usePendingCelebrations,
} from '../../hooks/use-celebrations';
import { useProfile } from '../../lib/profile';
import { useSubjects } from '../../hooks/use-subjects';
import { useOverallProgress } from '../../hooks/use-progress';
import { useStreaks } from '../../hooks/use-streaks';
import { useCoachingCard } from '../../hooks/use-coaching-card';
import { useSubscriptionStatus } from '../../hooks/use-subscription';
import { useApiReachability } from '../../hooks/use-api-reachability';
import { useTheme, useThemeColors } from '../../lib/theme';
import { useCelebrationLevel } from '../../hooks/use-settings';
import {
  clearSessionRecoveryMarker,
  isRecoveryMarkerFresh,
  readSessionRecoveryMarker,
} from '../../lib/session-recovery';
import { useApiClient } from '../../lib/api-client';

export default function HomeScreen() {
  const router = useRouter();
  const apiClient = useApiClient();
  const insets = useSafeAreaInsets();
  const {
    data: subjects,
    isLoading: subjectsLoading,
    isError: subjectsError,
    refetch: refetchSubjects,
    isRefetching,
  } = useSubjects();
  const { data: overallProgress } = useOverallProgress();
  const { data: streak } = useStreaks();
  const firstSubjectId = subjects?.find((s) => s.status === 'active')?.id;
  const coachingCard = useCoachingCard(firstSubjectId);
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const pendingCelebrations = usePendingCelebrations();
  const markCelebrationsSeen = useMarkCelebrationsSeen();
  const { data: subStatus } = useSubscriptionStatus();
  const { persona } = useTheme();
  const themeColors = useThemeColors();
  const { profiles, activeProfile, switchProfile } = useProfile();

  // Chat input state
  const [chatInput, setChatInput] = useState('');
  const {
    isApiReachable,
    isChecked: apiChecked,
    recheck: recheckApi,
  } = useApiReachability();
  const [recoveryCard, setRecoveryCard] = useState<{
    sessionId: string;
    subjectName?: string;
    active: boolean;
  } | null>(null);
  const { CelebrationOverlay } = useCelebration({
    queue: pendingCelebrations.data ?? [],
    celebrationLevel,
    audience: persona === 'learner' ? 'adult' : 'child',
    onAllComplete: () => {
      void markCelebrationsSeen.mutateAsync({ viewer: 'child' });
    },
  });

  // Practice subject picker state
  const [showPracticePicker, setShowPracticePicker] = useState(false);

  const activeSubjects = useMemo(
    () => subjects?.filter((s) => s.status === 'active') ?? [],
    [subjects]
  );

  const handlePracticePress = useCallback((): void => {
    // If coaching card has a subject-specific practice route, use it directly
    if (
      coachingCard.primaryRoute &&
      coachingCard.primaryRoute.includes('mode=practice') &&
      coachingCard.primaryRoute.includes('subjectId=')
    ) {
      router.push(coachingCard.primaryRoute as never);
      return;
    }

    // Single active subject: auto-select and navigate
    const singleSubject =
      activeSubjects.length === 1 ? activeSubjects[0] : undefined;
    if (singleSubject) {
      router.push(
        `/(learner)/session?mode=practice&subjectId=${
          singleSubject.id
        }&subjectName=${encodeURIComponent(singleSubject.name)}` as never
      );
      return;
    }

    // Multiple active subjects: show picker
    if (activeSubjects.length > 1) {
      setShowPracticePicker(true);
    }
  }, [coachingCard.primaryRoute, activeSubjects, router]);

  const handleChatSubmit = useCallback((): void => {
    const text = chatInput.trim();
    if (!text) return;

    const hasSubjects = activeSubjects.length > 0;

    if (hasSubjects) {
      // Has subjects — navigate as learning session. The session screen
      // auto-classifies which subject from the user's message text.
      router.push(
        `/(learner)/session?mode=learning&problemText=${encodeURIComponent(
          text
        )}` as never
      );
    } else {
      // No subjects yet — use freeform mode; session screen handles
      // subject classification and can work without a subject.
      router.push(
        `/(learner)/session?mode=freeform&problemText=${encodeURIComponent(
          text
        )}` as never
      );
    }

    setChatInput('');
  }, [chatInput, activeSubjects, router]);

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

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const marker = await readSessionRecoveryMarker();
      if (!marker || !mounted) return;

      try {
        const res = await apiClient.sessions[':sessionId'].$get({
          param: { sessionId: marker.sessionId },
        });
        if (!res.ok) {
          await clearSessionRecoveryMarker();
          return;
        }

        const data = (await res.json()) as {
          session: { id: string; status: string };
        };
        if (!mounted) return;

        setRecoveryCard({
          sessionId: marker.sessionId,
          subjectName: marker.subjectName,
          active:
            data.session.status === 'active' && isRecoveryMarkerFresh(marker),
        });
      } catch {
        if (mounted) {
          setRecoveryCard(null);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [apiClient]);

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
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior="padding"
      keyboardVerticalOffset={0}
      style={{ paddingTop: insets.top }}
    >
      <View className="px-5 pt-4 pb-2 flex-row justify-between items-center">
        <View>
          <Text className="text-h1 font-bold text-text-primary">
            {persona === 'teen'
              ? "What's on your mind?"
              : "Let's explore together!"}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {persona === 'teen' ? 'Your mate has ideas' : 'Your mate is ready'}
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

      {/* API unreachable warning (Bug #11) */}
      {apiChecked && !isApiReachable && (
        <View className="px-5 mt-2">
          <ApiUnreachableBanner onRetry={recheckApi} />
        </View>
      )}

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        testID="home-scroll-view"
        keyboardShouldPersistTaps="handled"
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

        {recoveryCard ? (
          <View
            className="bg-surface rounded-card px-4 py-4 mt-4"
            testID="unfinished-session-card"
          >
            <Text className="text-body font-semibold text-text-primary">
              {recoveryCard.active
                ? 'Pick up where you left off?'
                : 'Your session was saved'}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {recoveryCard.subjectName
                ? recoveryCard.subjectName
                : 'Your last session is ready.'}
            </Text>
            <View className="flex-row gap-2 mt-3">
              <Pressable
                onPress={() => {
                  if (recoveryCard.active) {
                    router.push({
                      pathname: '/(learner)/session',
                      params: { sessionId: recoveryCard.sessionId },
                    } as never);
                  } else {
                    void clearSessionRecoveryMarker();
                    router.push(
                      `/session-summary/${recoveryCard.sessionId}` as never
                    );
                  }
                }}
                className="flex-1 bg-primary rounded-button py-3 items-center"
              >
                <Text className="text-text-inverse text-body font-semibold">
                  {recoveryCard.active ? 'Continue Session' : 'See Summary'}
                </Text>
              </Pressable>
              {recoveryCard.active ? (
                <Pressable
                  onPress={() => {
                    void (async () => {
                      try {
                        const res = await apiClient.sessions[
                          ':sessionId'
                        ].close.$post({
                          param: { sessionId: recoveryCard.sessionId },
                          json: {
                            reason: 'silence_timeout',
                            summaryStatus: 'auto_closed',
                          },
                        });
                        if (!res.ok) {
                          setRecoveryCard(null);
                          return;
                        }
                        await clearSessionRecoveryMarker();
                        router.push(
                          `/session-summary/${recoveryCard.sessionId}` as never
                        );
                      } catch {
                        setRecoveryCard(null);
                      }
                    })();
                  }}
                  className="flex-1 bg-surface-elevated rounded-button py-3 items-center"
                >
                  <Text className="text-text-secondary text-body font-semibold">
                    End & See Summary
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                void clearSessionRecoveryMarker();
                setRecoveryCard(null);
              }}
              className="mt-3 self-start"
            >
              <Text className="text-caption text-text-secondary">Dismiss</Text>
            </Pressable>
          </View>
        ) : null}

        <AnimatedEntry>
          {coachingCard.isLoading && !subjectsError ? (
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
                  onPress: handlePracticePress,
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
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 mb-2 uppercase tracking-wider">
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
            {subjectsError ? (
              <View
                className="bg-surface rounded-card px-4 py-6 items-center"
                testID="subjects-error"
              >
                <Text className="text-body font-semibold text-text-primary mb-1">
                  Couldn't load subjects
                </Text>
                <Text className="text-body-sm text-text-secondary text-center mb-4">
                  Check your connection and try again.
                </Text>
                <Pressable
                  onPress={() => refetchSubjects()}
                  disabled={isRefetching}
                  className="bg-primary rounded-button py-3 items-center w-full min-h-[48px] justify-center"
                  testID="subjects-retry-button"
                  accessibilityLabel="Retry loading subjects"
                  accessibilityRole="button"
                >
                  {isRefetching ? (
                    <ActivityIndicator
                      size="small"
                      color="white"
                      testID="subjects-retry-loading"
                    />
                  ) : (
                    <Text className="text-text-inverse text-body font-semibold">
                      Retry
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : subjectsLoading ? (
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
                        <View className="flex-1 flex-shrink me-2">
                          <Text
                            className="text-body font-medium text-text-primary"
                            numberOfLines={1}
                          >
                            {subject.name}
                          </Text>
                        </View>
                        <RetentionSignal
                          status={subjectRetention.get(subject.id) ?? 'strong'}
                        />
                      </Pressable>
                      {/* end subject name pressable */}
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

      {/* Chat input — primary way to start a learning session (Bug #10) */}
      <View
        className="px-4 py-3 bg-surface border-t border-surface-elevated flex-row items-end"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        <TextInput
          className="flex-1 bg-background rounded-input px-4 py-3 text-body text-text-primary me-2"
          placeholder="Ask me anything..."
          placeholderTextColor={themeColors.muted}
          value={chatInput}
          onChangeText={setChatInput}
          onSubmitEditing={handleChatSubmit}
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit={false}
          testID="home-chat-input"
          accessibilityLabel="Ask a question to start learning"
        />
        <Pressable
          onPress={handleChatSubmit}
          disabled={!chatInput.trim()}
          className={`rounded-button px-5 py-3 min-h-[44px] min-w-[44px] items-center justify-center ${
            chatInput.trim() ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="home-send-button"
          accessibilityLabel="Start learning session"
          accessibilityRole="button"
        >
          <Ionicons
            name="send"
            size={20}
            color={
              chatInput.trim() ? themeColors.textInverse : themeColors.muted
            }
          />
        </Pressable>
      </View>

      {/* Practice for a test — subject picker bottom sheet */}
      <Modal
        visible={showPracticePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPracticePicker(false)}
        testID="practice-subject-picker"
      >
        <Pressable
          className="flex-1 bg-black/40"
          onPress={() => setShowPracticePicker(false)}
          accessibilityLabel="Close subject picker"
          accessibilityRole="button"
        />
        <View
          className="bg-background rounded-t-3xl px-5 pb-8 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
          </View>
          <Text className="text-h3 font-semibold text-text-primary mb-4">
            Which subject?
          </Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {activeSubjects.map((subject) => {
              const status = subjectRetention.get(subject.id) ?? 'weak';
              return (
                <Pressable
                  key={subject.id}
                  testID={`practice-subject-${subject.id}`}
                  onPress={() => {
                    setShowPracticePicker(false);
                    router.push(
                      `/(learner)/session?mode=practice&subjectId=${
                        subject.id
                      }&subjectName=${encodeURIComponent(
                        subject.name
                      )}` as never
                    );
                  }}
                  className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
                  accessibilityLabel={`Practice ${subject.name}`}
                  accessibilityRole="button"
                  style={{ minHeight: 48 }}
                >
                  <Text className="text-body font-medium text-text-primary">
                    {subject.name}
                  </Text>
                  <RetentionSignal status={status} />
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            onPress={() => setShowPracticePicker(false)}
            className="mt-4 items-center py-3"
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            style={{ minHeight: 44 }}
          >
            <Text className="text-body text-text-secondary font-medium">
              Cancel
            </Text>
          </Pressable>
        </View>
      </Modal>
      {CelebrationOverlay}
    </KeyboardAvoidingView>
  );
}
