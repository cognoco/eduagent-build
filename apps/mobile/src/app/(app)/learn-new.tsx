import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../components/home/IntentCard';
import { goBackOrReplace } from '../../lib/navigation';
import { useProfile } from '../../lib/profile';
import {
  clearSessionRecoveryMarker,
  isRecoveryMarkerFresh,
  readSessionRecoveryMarker,
  type SessionRecoveryMarker,
} from '../../lib/session-recovery';
import {
  useContinueSuggestion,
  useReviewSummary,
} from '../../hooks/use-progress';
import { useSubjects } from '../../hooks/use-subjects';
import { useThemeColors } from '../../lib/theme';

export default function LearnNewScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activeProfile, isLoading: isProfileLoading } = useProfile();
  const [recoveryMarker, setRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);
  const { data: continueSuggestion } = useContinueSuggestion();
  const { data: reviewSummary } = useReviewSummary();
  const { data: subjects } = useSubjects();

  const reviewDueCount = reviewSummary?.totalOverdue ?? 0;
  const reviewSubtitle =
    reviewDueCount > 0
      ? `${reviewDueCount} ${
          reviewDueCount === 1 ? 'topic' : 'topics'
        } ready for review`
      : 'Keep your knowledge fresh';

  const handleBack = () => {
    goBackOrReplace(router, '/(app)/home');
  };

  useEffect(() => {
    // BUG-310: Don't read until profile is confirmed — avoids reading the
    // wrong (unscoped) recovery key while activeProfile is still null.
    if (isProfileLoading) return;

    let cancelled = false;

    async function loadRecoveryMarker(): Promise<void> {
      try {
        const marker = await readSessionRecoveryMarker(activeProfile?.id);
        if (!cancelled) {
          if (marker && isRecoveryMarkerFresh(marker)) {
            setRecoveryMarker(marker);
          } else {
            setRecoveryMarker(null);
            if (marker) {
              // Stale marker — clear silently
              void clearSessionRecoveryMarker(activeProfile?.id).catch(
                () => undefined
              );
            }
          }
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
  }, [activeProfile?.id, isProfileLoading]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="learn-new-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={handleBack}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="learn-new-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          What would you like to learn?
        </Text>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Pick a subject"
          onPress={() => router.push('/create-subject' as never)}
          testID="intent-pick-subject"
        />
        <IntentCard
          title="Just ask anything"
          onPress={() => router.push('/(app)/session?mode=freeform' as never)}
          testID="intent-freeform"
        />
        {continueSuggestion ? (
          <IntentCard
            title="Repeat & review"
            subtitle={reviewSubtitle}
            badge={reviewDueCount > 0 ? reviewDueCount : undefined}
            onPress={() => {
              const nextReviewTopic = reviewSummary?.nextReviewTopic ?? null;
              if (nextReviewTopic) {
                router.push({
                  pathname: '/(app)/topic/relearn',
                  params: {
                    topicId: nextReviewTopic.topicId,
                    subjectId: nextReviewTopic.subjectId,
                    topicName: nextReviewTopic.topicTitle,
                  },
                } as never);
              } else {
                router.push('/(app)/library' as never);
              }
            }}
            testID="intent-review"
          />
        ) : null}
        {!recoveryMarker &&
        !continueSuggestion &&
        subjects &&
        subjects.length > 0 ? (
          <IntentCard
            title={`Continue with ${subjects[0]!.name}`}
            onPress={() =>
              router.push({
                pathname: '/(app)/session',
                params: {
                  subjectId: subjects[0]!.id,
                  subjectName: subjects[0]!.name,
                  mode: 'learning',
                },
              } as never)
            }
            testID="intent-continue-subject"
          />
        ) : null}
        {recoveryMarker ? (
          <IntentCard
            title="Continue where you left off"
            subtitle={recoveryMarker.subjectName}
            onPress={() =>
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
                  ...(recoveryMarker.mode && {
                    mode: recoveryMarker.mode,
                  }),
                  ...(recoveryMarker.topicId && {
                    topicId: recoveryMarker.topicId,
                  }),
                  ...(recoveryMarker.topicName && {
                    topicName: recoveryMarker.topicName,
                  }),
                },
              } as never)
            }
            testID="intent-resume"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
