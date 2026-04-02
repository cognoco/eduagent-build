import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeColors } from '../../lib/theme';
import { useUpdateLearningMode } from '../../hooks/use-settings';
import { useRatingPrompt } from '../../hooks/use-rating-prompt';
import {
  useSessionTranscript,
  useSkipSummary,
  useSubmitSummary,
} from '../../hooks/use-sessions';
import { Sentry } from '../../lib/sentry';
import {
  CheckmarkPopAnimation,
  BrandCelebration,
} from '../../components/common';

export default function SessionSummaryScreen() {
  const {
    sessionId,
    subjectName,
    exchangeCount,
    escalationRung,
    subjectId,
    topicId,
    wallClockSeconds,
    milestones,
    fastCelebrations,
  } = useLocalSearchParams<{
    sessionId: string;
    subjectName?: string;
    exchangeCount?: string;
    escalationRung?: string;
    subjectId?: string;
    topicId?: string;
    wallClockSeconds?: string;
    milestones?: string;
    fastCelebrations?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [summaryText, setSummaryText] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submitSummary = useSubmitSummary(sessionId ?? '');
  const skipSummary = useSkipSummary(sessionId ?? '');
  const updateLearningMode = useUpdateLearningMode();
  const transcript = useSessionTranscript(sessionId ?? '');
  const { onSuccessfulRecall } = useRatingPrompt();
  const { persona } = useTheme();

  const fallbackSession = transcript.data?.session;
  const exchanges =
    parseInt(exchangeCount ?? '', 10) || fallbackSession?.exchangeCount || 0;
  const rung = parseInt(escalationRung ?? '1', 10) || 1;
  const wallClockMinutes = Math.max(
    1,
    Math.round(
      (parseInt(wallClockSeconds ?? '', 10) ||
        fallbackSession?.wallClockSeconds ||
        0) / 60
    )
  );
  const parsedMilestones = (() => {
    if (!milestones) {
      return fallbackSession?.milestonesReached ?? [];
    }

    try {
      return JSON.parse(decodeURIComponent(milestones)) as string[];
    } catch {
      return fallbackSession?.milestonesReached ?? [];
    }
  })();
  const parsedFastCelebrations = (() => {
    try {
      return JSON.parse(decodeURIComponent(fastCelebrations ?? '[]')) as Array<{
        reason?: string;
        detail?: string | null;
      }>;
    } catch {
      return [] as Array<{ reason?: string; detail?: string | null }>;
    }
  })();
  const isRecallSummary =
    transcript.data?.session.verificationType === 'evaluate' ||
    transcript.data?.session.verificationType === 'teach_back';

  const maybePromptForRecall = async (): Promise<void> => {
    if (!isRecallSummary) return;
    try {
      await onSuccessfulRecall();
    } catch {
      // Best effort only — store review availability varies by device/store.
    }
  };

  if (!sessionId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-text-secondary text-body text-center">
          Session not found.
        </Text>
      </View>
    );
  }

  if (
    !exchangeCount &&
    !wallClockSeconds &&
    transcript.isLoading &&
    !transcript.data
  ) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <ActivityIndicator />
        <Text className="text-text-secondary text-body text-center mt-3">
          Loading your session summary...
        </Text>
      </View>
    );
  }

  const handleSubmit = async (): Promise<void> => {
    if (summaryText.trim().length < 10 || submitSummary.isPending) return;

    try {
      const result = await submitSummary.mutateAsync({
        content: summaryText.trim(),
      });
      setAiFeedback(result.summary.aiFeedback);
      setSubmitted(true);

      // Story 10.8 Phase 0: summary_submitted event
      Sentry.addBreadcrumb({
        category: 'summary',
        message: 'summary_submitted',
        data: {
          sessionId,
          persona,
          exchangeCount: exchanges,
          charCount: summaryText.trim().length,
        },
        level: 'info',
      });
    } catch {
      // Error state handled by mutation
    }
  };

  const handleContinue = async (): Promise<void> => {
    // Story 10.8 Phase 0: summary_skipped event (only when not yet submitted)
    if (!submitted) {
      if (skipSummary.isPending) return;

      let skipResult:
        | Awaited<ReturnType<typeof skipSummary.mutateAsync>>
        | undefined;
      try {
        skipResult = await skipSummary.mutateAsync();
      } catch {
        return;
      }

      Sentry.addBreadcrumb({
        category: 'summary',
        message: 'summary_skipped',
        data: { sessionId, persona, exchangeCount: exchanges },
        level: 'info',
      });

      if (skipResult?.shouldPromptCasualSwitch) {
        Alert.alert(
          'Try Casual Explorer?',
          'You can keep learning without writing a summary each time. Switch now?',
          [
            {
              text: 'Not now',
              style: 'cancel',
              onPress: () => {
                void (async () => {
                  await maybePromptForRecall();
                  router.replace('/(learner)/home');
                })();
              },
            },
            {
              text: 'Switch',
              onPress: () => {
                void (async () => {
                  try {
                    await updateLearningMode.mutateAsync('casual');
                    await maybePromptForRecall();
                    router.replace('/(learner)/home');
                  } catch {
                    Alert.alert(
                      "Couldn't switch right now",
                      'You can change your learning mode later in More.',
                      [
                        {
                          text: 'OK',
                          onPress: () => {
                            void (async () => {
                              await maybePromptForRecall();
                              router.replace('/(learner)/home');
                            })();
                          },
                        },
                      ]
                    );
                  }
                })();
              },
            },
          ]
        );
        return;
      }
    }
    await maybePromptForRecall();
    router.replace('/(learner)/home');
  };

  const handleGoToLearningBook = (): void => {
    if (topicId && subjectId) {
      router.replace({
        pathname: '/(learner)/topic/[topicId]',
        params: { topicId, subjectId },
      } as never);
    } else if (fallbackSession?.topicId && fallbackSession.subjectId) {
      router.replace({
        pathname: '/(learner)/topic/[topicId]',
        params: {
          topicId: fallbackSession.topicId,
          subjectId: fallbackSession.subjectId,
        },
      } as never);
    } else {
      router.replace('/(learner)/book');
    }
  };

  const takeaways: string[] = [];
  takeaways.push(
    `${wallClockMinutes} minute${
      wallClockMinutes === 1 ? '' : 's'
    } - great session!`
  );
  if (exchanges > 0) {
    takeaways.push(
      `You worked through ${exchanges} exchange${exchanges === 1 ? '' : 's'}`
    );
  }
  if (rung >= 3) {
    takeaways.push('You tackled some challenging concepts with guidance');
  } else if (exchanges > 0) {
    takeaways.push('You showed strong independent thinking');
  }
  if (takeaways.length === 0) {
    takeaways.push('Great effort today');
  }

  const milestoneLabels = parsedMilestones.map((milestone) => {
    switch (milestone) {
      case 'polar_star':
        return 'Polar Star - first independent answer';
      case 'deep_diver':
        return 'Deep Diver - great thoughtful responses';
      case 'comet':
        return 'Comet - you had a breakthrough!';
      case 'orions_belt':
        return "Orion's Belt - 5 in a row without help!";
      case 'persistent':
        return 'Persistent - you kept going';
      case 'twin_stars':
        return 'Twin Stars - three strong answers in a row';
      default:
        return milestone;
    }
  });

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        className="px-4 py-3 bg-surface border-b border-surface-elevated"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="me-2 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel="Close and go home"
            accessibilityRole="button"
            testID="summary-close-button"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <BrandCelebration size={36} />
          <Text
            className="text-h3 font-semibold text-text-primary ms-2"
            testID="summary-title"
          >
            Session Complete
          </Text>
        </View>
        {subjectName ? (
          <Text className="text-caption text-text-secondary mt-1">
            {subjectName}
          </Text>
        ) : null}
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Session takeaways (learner-friendly, no internal metrics) */}
        <View
          className="bg-surface rounded-card p-4 mb-4"
          testID="session-takeaways"
        >
          <Text className="text-body font-semibold text-text-primary mb-2">
            What happened
          </Text>
          {takeaways.map((t, i) => (
            <View key={i} className="flex-row items-start mt-1">
              <Text className="text-body text-text-secondary me-2">
                {'\u2022'}
              </Text>
              <Text className="text-body text-text-primary flex-1">{t}</Text>
            </View>
          ))}
          <Text className="text-caption text-text-secondary mt-3">
            Your mate will check in soon
          </Text>
        </View>

        {milestoneLabels.length > 0 ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="milestone-recap"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              Milestones
            </Text>
            {milestoneLabels.map((label) => (
              <View key={label} className="flex-row items-start mt-1">
                <Text className="text-body text-text-secondary me-2">
                  {'\u2022'}
                </Text>
                <Text className="text-body text-text-primary flex-1">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {parsedFastCelebrations.length > 0 ? (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            testID="fast-celebrations"
          >
            <Text className="text-body font-semibold text-text-primary mb-2">
              Fresh wins
            </Text>
            {parsedFastCelebrations.map((celebration, index) => (
              <Text
                key={`${celebration.reason ?? 'celebration'}-${index}`}
                className="text-body text-text-primary mt-1"
              >
                {celebration.detail ??
                  'A new achievement landed right after your session.'}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Your Words section */}
        <View className="mb-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            Your Words
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            Write a short summary of what you learned. This helps you remember
            and helps your mate plan next time.
          </Text>

          {!submitted ? (
            <>
              <TextInput
                className="bg-surface rounded-card px-4 py-3 text-body text-text-primary min-h-[120px]"
                placeholder="In my own words, I learned that..."
                placeholderTextColor={colors.muted}
                value={summaryText}
                onChangeText={setSummaryText}
                multiline
                maxLength={2000}
                textAlignVertical="top"
                editable={!submitSummary.isPending}
                testID="summary-input"
                accessibilityLabel="Write your learning summary"
              />
              <Text className="text-caption text-text-secondary mt-1 text-right">
                {summaryText.length}/2000
              </Text>

              {submitSummary.isError && (
                <Text
                  className="text-body-sm text-danger mt-2"
                  testID="summary-error"
                >
                  Couldn't save your summary. Check your connection and try
                  again — your work won't be lost.
                </Text>
              )}

              {skipSummary.isError && (
                <Text
                  className="text-body-sm text-danger mt-2"
                  testID="skip-summary-error"
                >
                  Couldn't skip your summary right now. Check your connection
                  and try again.
                </Text>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={
                  summaryText.trim().length < 10 || submitSummary.isPending
                }
                className={`rounded-button py-3 items-center mt-3 ${
                  summaryText.trim().length >= 10 && !submitSummary.isPending
                    ? 'bg-primary'
                    : 'bg-surface-elevated'
                }`}
                testID="submit-summary-button"
                accessibilityLabel="Submit summary"
                accessibilityRole="button"
              >
                {submitSummary.isPending ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text
                    className={`text-body font-semibold ${
                      summaryText.trim().length >= 10
                        ? 'text-text-inverse'
                        : 'text-text-secondary'
                    }`}
                  >
                    Submit Summary
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <View
              className="bg-surface rounded-card p-4"
              testID="summary-submitted"
            >
              <View className="items-center mb-3">
                <CheckmarkPopAnimation size={56} />
              </View>
              <Text className="text-body text-text-primary mb-2">
                {summaryText}
              </Text>
              <View className="h-px bg-surface-elevated my-3" />
              <Text className="text-body-sm font-semibold text-text-primary mb-1">
                Mate feedback
              </Text>
              <Text
                className="text-body-sm text-text-secondary"
                testID="ai-feedback"
              >
                {aiFeedback}
              </Text>
            </View>
          )}
        </View>

        {/* Skip / Continue */}
        {!submitted ? (
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="py-3 items-center"
            testID="skip-summary-button"
            accessibilityLabel="Skip summary"
            accessibilityRole="button"
          >
            <Text className="text-body-sm text-text-secondary">
              {skipSummary.isPending ? 'Skipping...' : 'Skip for now'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              void handleContinue();
            }}
            className="bg-primary rounded-button py-3 items-center mt-2"
            testID="continue-button"
            accessibilityLabel="Continue to home"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Continue
            </Text>
          </Pressable>
        )}

        {/* Story 4.12: Post-session Learning Book navigation */}
        <Pressable
          onPress={handleGoToLearningBook}
          className="py-3 items-center mt-1"
          testID="go-to-learning-book"
          accessibilityLabel="See your Learning Book"
          accessibilityRole="link"
        >
          <Text className="text-caption text-text-secondary">
            See your Learning Book
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
