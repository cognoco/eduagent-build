import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Profile } from '@eduagent/schemas';
import { BookPageFlipAnimation, ProfileSwitcher } from '../common';
import {
  useMarkQuizDiscoverySurfaced,
  useQuizDiscoveryCard,
} from '../../hooks/use-coaching-card';
import {
  useContinueSuggestion,
  useReviewSummary,
} from '../../hooks/use-progress';
import { useSubjects } from '../../hooks/use-subjects';
import { getGreeting } from '../../lib/greeting';
import {
  clearSessionRecoveryMarker,
  isRecoveryMarkerFresh,
  readSessionRecoveryMarker,
  type SessionRecoveryMarker,
} from '../../lib/session-recovery';
import { useThemeColors } from '../../lib/theme';
import { IntentCard } from './IntentCard';
import { EarlyAdopterCard } from './EarlyAdopterCard';

export interface LearnerScreenProps {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (
    profileId: string
  ) => Promise<{ success: boolean; error?: string }>;
  onBack?: () => void;
  /** Injectable clock for deterministic testing of time-based greeting. */
  now?: Date;
}

export function LearnerScreen({
  profiles,
  activeProfile,
  switchProfile,
  onBack,
  now,
}: LearnerScreenProps): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: subjects, isLoading, isError, refetch } = useSubjects();
  const { data: continueSuggestion } = useContinueSuggestion();
  const { data: reviewSummary } = useReviewSummary();
  const { data: quizDiscovery } = useQuizDiscoveryCard();
  const markQuizDiscoverySurfaced = useMarkQuizDiscoverySurfaced();
  const [recoveryMarker, setRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);
  const [dismissedQuizDiscoveryId, setDismissedQuizDiscoveryId] = useState<
    string | null
  >(null);
  const isParentProxy = Boolean(
    activeProfile && !activeProfile.isOwner && profiles.some((p) => p.isOwner)
  );

  // [F-044] Loading timeout — show fallback after 15s so users aren't
  // stuck on a bare spinner with no escape.
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecoveryMarker(): Promise<void> {
      try {
        const marker = await readSessionRecoveryMarker(activeProfile?.id);
        if (cancelled) return;

        if (marker && isRecoveryMarkerFresh(marker)) {
          setRecoveryMarker((current) =>
            current?.sessionId === marker.sessionId &&
            current?.updatedAt === marker.updatedAt
              ? current
              : marker
          );
          return;
        }

        setRecoveryMarker((current) => (current === null ? current : null));
        if (marker) {
          // Stale marker — clear silently. The "Continue where you left off"
          // card uses continueSuggestion (API-driven) and doesn't need this.
          void clearSessionRecoveryMarker(activeProfile?.id).catch((err) =>
            console.error('[LearnerScreen] stale marker cleanup failed:', err)
          );
        }
      } catch {
        if (!cancelled) {
          setRecoveryMarker((current) => (current === null ? current : null));
        }
      }
    }

    void loadRecoveryMarker();

    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  useEffect(() => {
    setDismissedQuizDiscoveryId(null);
  }, [activeProfile?.id, quizDiscovery?.id]);

  const { title, subtitle } = getGreeting(
    activeProfile?.displayName ?? '',
    now
  );

  const markQuizDiscoveryHandled = useCallback(() => {
    if (!quizDiscovery) return;
    setDismissedQuizDiscoveryId(quizDiscovery.id);
    markQuizDiscoverySurfaced.mutate(quizDiscovery.activityType);
  }, [markQuizDiscoverySurfaced, quizDiscovery]);

  const intentCards = useMemo(() => {
    const cards: Array<{
      testID: string;
      title: string;
      subtitle?: string;
      icon: React.ComponentProps<typeof Ionicons>['name'];
      variant?: 'default' | 'highlight';
      onPress?: () => void;
      onDismiss?: () => void;
    }> = [];

    if (!isParentProxy) {
      if (recoveryMarker) {
        cards.push({
          testID: 'intent-continue',
          title: 'Continue',
          subtitle: `${recoveryMarker.subjectName ?? 'Session'} \u00b7 resume`,
          icon: 'play-circle-outline',
          variant: 'highlight',
          onPress: () => {
            void clearSessionRecoveryMarker(activeProfile?.id).catch((err) =>
              console.error(
                '[LearnerScreen] clearSessionRecoveryMarker failed:',
                err
              )
            );
            router.push({
              pathname: '/(app)/session',
              params: {
                sessionId: recoveryMarker.sessionId,
                ...(recoveryMarker.subjectId && {
                  subjectId: recoveryMarker.subjectId,
                }),
                ...(recoveryMarker.subjectName && {
                  subjectName: recoveryMarker.subjectName,
                }),
                ...(recoveryMarker.mode && { mode: recoveryMarker.mode }),
                ...(recoveryMarker.topicId && {
                  topicId: recoveryMarker.topicId,
                }),
                ...(recoveryMarker.topicName && {
                  topicName: recoveryMarker.topicName,
                }),
              },
            } as never);
          },
        });
      } else if (continueSuggestion) {
        cards.push({
          testID: 'intent-continue',
          title: 'Continue',
          subtitle: `Pick up ${continueSuggestion.topicTitle}`,
          icon: 'play-circle-outline',
          onPress: () =>
            router.push({
              pathname: '/(app)/session',
              params: {
                ...(continueSuggestion.lastSessionId && {
                  sessionId: continueSuggestion.lastSessionId,
                }),
                subjectId: continueSuggestion.subjectId,
                subjectName: continueSuggestion.subjectName,
                topicId: continueSuggestion.topicId,
                topicName: continueSuggestion.topicTitle,
                mode: 'learning',
              },
            } as never),
        });
      } else if (
        reviewSummary &&
        reviewSummary.totalOverdue > 0 &&
        reviewSummary.nextReviewTopic
      ) {
        cards.push({
          testID: 'intent-continue',
          title: 'Continue',
          subtitle: `${reviewSummary.nextReviewTopic.subjectName} \u00b7 ${
            reviewSummary.totalOverdue
          } topic${reviewSummary.totalOverdue === 1 ? '' : 's'} to review`,
          icon: 'play-circle-outline',
          onPress: () =>
            router.push({
              pathname: '/(app)/topic/relearn',
              params: {
                topicId: reviewSummary.nextReviewTopic?.topicId,
                subjectId: reviewSummary.nextReviewTopic?.subjectId,
                topicName: reviewSummary.nextReviewTopic?.topicTitle,
              },
            } as never),
        });
      }
    }

    if (
      !isParentProxy &&
      quizDiscovery &&
      dismissedQuizDiscoveryId !== quizDiscovery.id
    ) {
      cards.push({
        testID: 'intent-quiz-discovery',
        title: quizDiscovery.title,
        subtitle: quizDiscovery.body,
        icon: 'sparkles-outline',
        variant: 'highlight',
        onDismiss: () => {
          markQuizDiscoveryHandled();
        },
        onPress: () => {
          markQuizDiscoveryHandled();
          router.push({
            pathname: '/(app)/quiz',
            params: { activityType: quizDiscovery.activityType },
          } as never);
        },
      });
    }

    cards.push({
      testID: 'intent-learn',
      title: 'Learn',
      subtitle: 'Start a new subject or pick one',
      icon: 'book-outline',
      onPress: () => router.push('/create-subject' as never),
    });

    if (!isParentProxy) {
      cards.push({
        testID: 'intent-ask',
        title: 'Ask',
        subtitle: 'Get answers to any question',
        icon: 'chatbubble-ellipses-outline',
        onPress: () => router.push('/(app)/session?mode=freeform' as never),
      });
      cards.push({
        testID: 'intent-practice',
        title: 'Practice',
        subtitle: 'Games and reviews to sharpen what you know',
        icon: 'game-controller-outline',
        onPress: () => router.push('/(app)/practice' as never),
      });
      cards.push({
        testID: 'intent-homework',
        title: 'Homework',
        subtitle: 'Snap a photo, get help',
        icon: 'camera-outline',
        onPress: () => router.push('/(app)/homework/camera' as never),
      });
    }

    if (isParentProxy) {
      cards.push({
        testID: 'intent-proxy-placeholder',
        title: `Sessions are private to ${
          activeProfile?.displayName ?? 'this learner'
        }`,
        icon: 'lock-closed-outline',
      });
    }

    return cards;
  }, [
    activeProfile?.id,
    activeProfile?.displayName,
    continueSuggestion,
    dismissedQuizDiscoveryId,
    isParentProxy,
    markQuizDiscoveryHandled,
    quizDiscovery,
    recoveryMarker,
    reviewSummary,
    router,
  ]);

  if (isLoading) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        testID="learner-loading-state"
      >
        <BookPageFlipAnimation size={140} />
        {loadingTimedOut && (
          <View className="mt-6 items-center" testID="learner-loading-timeout">
            <Text className="text-body text-text-secondary text-center">
              Taking longer than usual...
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-6 py-2"
              testID="learner-loading-retry"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Retry
              </Text>
            </Pressable>
            {onBack ? (
              <Pressable
                onPress={onBack}
                className="mt-2 min-h-[44px] items-center justify-center px-6 py-2"
                testID="learner-loading-go-back"
              >
                <Text className="text-body text-text-secondary">Go back</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.replace('/(app)/home' as never)}
                className="mt-2 min-h-[44px] items-center justify-center px-6 py-2"
                testID="learner-loading-go-home"
              >
                <Text className="text-body text-text-secondary">Go home</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  if (isError && !subjects) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        testID="learner-error-state"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          We couldn't load your library right now
        </Text>
        <Pressable
          onPress={() => void refetch()}
          className="min-h-[44px] px-6 items-center justify-center bg-surface rounded-card"
          accessibilityRole="button"
          accessibilityLabel="Retry loading library"
        >
          <Text className="text-body font-semibold text-text-primary">
            Retry
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="learner-screen">
      {/* Header outside ScrollView so ProfileSwitcher dropdown isn't clipped */}
      <View
        className="flex-row items-center justify-between px-5"
        style={{
          paddingTop: insets.top + 16,
          zIndex: 10,
          elevation: 10,
        }}
      >
        <View className="flex-row items-center flex-1 me-3">
          {onBack ? (
            <Pressable
              onPress={onBack}
              className="mr-3 min-h-[44px] min-w-[44px] items-center justify-center"
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
          activeProfileId={activeProfile?.id}
          onSwitch={switchProfile}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <EarlyAdopterCard />
        <View className="gap-4" testID="learner-intent-stack">
          {intentCards.map((card) => (
            <IntentCard key={card.testID} {...card} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
