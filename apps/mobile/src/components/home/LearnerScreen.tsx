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
  useReviewSummary,
  useContinueSuggestion,
} from '../../hooks/use-progress';
import { useSubjects } from '../../hooks/use-subjects';
import { getGreeting } from '../../lib/greeting';
import {
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

const REVIEW_PRIORITY_THRESHOLD = 5;

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
  const { data: reviewSummary } = useReviewSummary();
  const { data: continueSuggestion } = useContinueSuggestion();
  const continueSubtitle = continueSuggestion
    ? `Continue with ${continueSuggestion.topicTitle} in ${continueSuggestion.subjectName}`
    : undefined;
  const [recoveryMarker, setRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);
  const [recentlyExpiredSession, setRecentlyExpiredSession] = useState(false);

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
          // [3C.4] Do NOT clear the marker here — SessionScreen is responsible
          // for clearing it only after the server acknowledges the close.
          setRecentlyExpiredSession(true);
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

  const activeSubjects =
    subjects?.filter((subject) => subject.status === 'active') ?? [];
  const hasLibraryContent = activeSubjects.length > 0;
  const reviewDueCount = reviewSummary?.totalOverdue ?? 0;
  const { title, subtitle } = getGreeting(
    activeProfile?.displayName ?? '',
    now
  );
  const reviewSubtitle =
    reviewDueCount > 0
      ? `${reviewDueCount} ${
          reviewDueCount === 1 ? 'topic' : 'topics'
        } ready for review`
      : 'Keep your knowledge fresh';

  const intentCards = useMemo(() => {
    const primaryCard = {
      title: 'Start learning',
      subtitle: continueSubtitle,
      onPress: () => router.push('/learn-new' as never),
      testID: 'intent-learn-new',
    };
    const homeworkCard = {
      title: 'Help with assignment?',
      subtitle: "Take a picture and we'll look at it together",
      onPress: () => router.push('/(app)/homework/camera' as never),
      testID: 'intent-homework',
    };
    const reviewCard = hasLibraryContent
      ? {
          title: 'Repeat & review',
          subtitle: reviewSubtitle,
          badge: reviewDueCount > 0 ? reviewDueCount : undefined,
          onPress: () => router.push('/(app)/library' as never),
          testID: 'intent-review',
        }
      : null;
    const resumeCard = recoveryMarker
      ? {
          title: 'Continue where you left off',
          subtitle: recoveryMarker.subjectName ?? 'Your last session',
          variant: 'highlight' as const,
          onPress: () =>
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
              },
            } as never),
          testID: 'intent-resume',
        }
      : null;

    const cards = [];
    if (resumeCard) cards.push(resumeCard);
    if (reviewCard && reviewDueCount >= REVIEW_PRIORITY_THRESHOLD) {
      cards.push(reviewCard);
    }
    cards.push(primaryCard, homeworkCard);
    if (reviewCard && reviewDueCount < REVIEW_PRIORITY_THRESHOLD) {
      cards.push(reviewCard);
    }

    return cards;
  }, [
    continueSubtitle,
    hasLibraryContent,
    recoveryMarker,
    reviewDueCount,
    reviewSubtitle,
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
        {recentlyExpiredSession && (
          <Pressable
            onPress={() => setRecentlyExpiredSession(false)}
            className="bg-surface rounded-card p-4 mb-2"
            accessibilityRole="button"
            accessibilityLabel="Dismiss session expired notice"
            testID="recently-expired-banner"
          >
            <Text className="text-body-sm text-text-secondary">
              Your previous session has expired and can no longer be resumed.
            </Text>
            <Text className="text-caption text-text-muted mt-1">
              Tap to dismiss
            </Text>
          </Pressable>
        )}

        <View className="gap-4" testID="learner-intent-stack">
          {intentCards.map((card) => (
            <IntentCard key={card.testID} {...card} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
