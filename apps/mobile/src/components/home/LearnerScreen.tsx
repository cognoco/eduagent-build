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
import { useContinueSuggestion } from '../../hooks/use-progress';
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
          void clearSessionRecoveryMarker(activeProfile?.id).catch(
            () => undefined
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
    const primaryCard = {
      title: 'Start learning',
      onPress: () => router.push('/learn-new' as never),
      testID: 'intent-learn-new',
    };
    const homeworkCard = {
      title: 'Help with assignment?',
      subtitle: "Take a picture and we'll look at it together",
      onPress: () => router.push('/(app)/homework/camera' as never),
      testID: 'intent-homework',
    };
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
                ...(recoveryMarker.topicName && {
                  topicName: recoveryMarker.topicName,
                }),
              },
            } as never),
          testID: 'intent-resume',
        }
      : null;
    const continueCard =
      !recoveryMarker && continueSuggestion
        ? {
            title: 'Continue where you left off',
            subtitle: continueSuggestion.subjectName,
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
            testID: 'intent-resume-last',
          }
        : null;

    const cards = [];
    if (resumeCard) cards.push(resumeCard);
    if (continueCard) cards.push(continueCard);
    cards.push(primaryCard, homeworkCard);

    return cards;
  }, [continueSuggestion, recoveryMarker, router]);

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
