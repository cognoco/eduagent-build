import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Profile } from '@eduagent/schemas';
import { ProfileSwitcher } from '../common';
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
  const markSurfaced = useMarkQuizDiscoverySurfaced();
  const [recoveryMarker, setRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecoveryMarker(): Promise<void> {
      try {
        const marker = await readSessionRecoveryMarker(activeProfile?.id);
        if (cancelled) return;

        if (marker && isRecoveryMarkerFresh(marker)) {
          setRecoveryMarker(marker);
          return;
        }

        setRecoveryMarker(null);
        if (marker) {
          // Stale marker — clear silently. The "Continue where you left off"
          // card uses continueSuggestion (API-driven) and doesn't need this.
          void clearSessionRecoveryMarker(activeProfile?.id).catch((err) =>
            console.error('[LearnerScreen] stale marker cleanup failed:', err)
          );
        }
      } catch {
        if (!cancelled) {
          setRecoveryMarker(null);
        }
      }
    }

    void loadRecoveryMarker();

    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  const { title, subtitle } = getGreeting(
    activeProfile?.displayName ?? '',
    now
  );

  const intentCards = useMemo(() => {
    const cards: Array<{
      testID: string;
      title: string;
      subtitle?: string;
      icon: React.ComponentProps<typeof Ionicons>['name'];
      variant?: 'default' | 'highlight';
      onPress: () => void;
    }> = [];

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
        subtitle: `${continueSuggestion.subjectName} \u00b7 ${continueSuggestion.topicTitle}`,
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

    if (quizDiscovery) {
      cards.push({
        testID: 'intent-quiz-discovery',
        title: quizDiscovery.title,
        subtitle: quizDiscovery.body,
        icon: 'sparkles-outline',
        variant: 'highlight',
        onPress: () => {
          markSurfaced.mutate(quizDiscovery.activityType);
          router.push({
            pathname: '/(app)/quiz',
            params: { activityType: quizDiscovery.activityType },
          } as never);
        },
      });
    }

    cards.push(
      {
        testID: 'intent-learn',
        title: 'Learn',
        subtitle: 'Start a new subject or pick one',
        icon: 'book-outline',
        onPress: () => router.push('/create-subject' as never),
      },
      {
        testID: 'intent-ask',
        title: 'Ask',
        subtitle: 'Get answers to any question',
        icon: 'chatbubble-ellipses-outline',
        onPress: () => router.push('/(app)/session?mode=freeform' as never),
      },
      {
        testID: 'intent-practice',
        title: 'Practice',
        subtitle: 'Games and reviews to sharpen what you know',
        icon: 'game-controller-outline',
        onPress: () => router.push('/(app)/practice' as never),
      },
      {
        testID: 'intent-homework',
        title: 'Homework',
        subtitle: 'Snap a photo, get help',
        icon: 'camera-outline',
        onPress: () => router.push('/(app)/homework/camera' as never),
      }
    );

    return cards;
  }, [
    activeProfile?.id,
    continueSuggestion,
    markSurfaced,
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
      >
        <ActivityIndicator size="large" />
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
        <View className="gap-4" testID="learner-intent-stack">
          {intentCards.map((card) => (
            <IntentCard key={card.testID} {...card} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
