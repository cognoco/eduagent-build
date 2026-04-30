import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { QuizRoundResponse } from '@eduagent/schemas';
import { ErrorFallback } from '../../../components/common/ErrorFallback';
import { useGenerateRound } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { useQuizFlow } from './_layout';

// [BUG-UX-QUIZ-TIMEOUT] Hard UI-level timeout: if the mutation is still pending
// after 30s the user sees a full error panel instead of an infinite spinner.
// This complements the 20s soft nudge (timedOut) which only shows a text hint
// and relies on the user finding the Cancel button.
const ROUND_GENERATION_TIMEOUT_MS = 30_000;

// [F-Q-01] Map error codes to kid-friendly copy so the error panel
// never leaks raw JSON envelopes or HTTP status codes. The fallback trims any
// message over 60 chars — those are almost always raw API payloads.
export function friendlyErrorMessage(
  code: string | undefined,
  fallback: string
): string {
  switch (code) {
    case 'UPSTREAM_ERROR':
      return 'Something went wrong creating your quiz. Try again!';
    case 'TIMEOUT':
      return 'The quiz took too long to create. Try again!';
    case 'RATE_LIMITED':
      return 'Too many requests — wait a moment and try again.';
    case 'VALIDATION_ERROR':
      return 'Something went wrong. Please try a different activity.';
    default:
      return fallback.length > 60
        ? 'Something went wrong. Try again!'
        : fallback;
  }
}

const LOADING_MESSAGES = [
  'Shuffling questions...',
  'Picking a theme...',
  'Almost ready...',
];

export default function QuizLaunchScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activityType, subjectId, setRound } = useQuizFlow();
  const generateRound = useGenerateRound();
  const generateRoundMutate = generateRound.mutate;
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [challengeRound, setChallengeRound] =
    useState<QuizRoundResponse | null>(null);
  // [ASSUMP-F4] Surface a "still trying" hint after 20s so users on slow
  // networks know the app isn't frozen and can fall back to the explicit
  // Cancel button. Prevents the "infinite spinner" dead-end that the UX
  // audit flagged as the #1 source of kid abandonment.
  const [timedOut, setTimedOut] = useState(false);
  // [BUG-UX-QUIZ-TIMEOUT] Separate hard-timeout state that flips to an error
  // panel. Kept distinct from timedOut (soft hint) so the two behaviours are
  // independently testable and can be tuned separately.
  const [hardTimedOut, setHardTimedOut] = useState(false);
  const startedRef = useRef(false);

  const enterPlay = useCallback(
    (round: QuizRoundResponse) => {
      setRound(round);
      setChallengeRound(null);
      router.replace('/(app)/quiz/play' as never);
    },
    [router, setRound]
  );

  // [ASSUMP-F1] Single entry point so retry gets the same onSuccess handler
  // as the initial mutation. Previously retry called `generateRound.mutate()`
  // with no callbacks, so on retry success nothing navigated and the user
  // was stuck on the loading spinner.
  const startRound = useCallback(() => {
    if (!activityType) return;
    generateRoundMutate(
      { activityType, subjectId: subjectId ?? undefined },
      {
        onSuccess: (round) => {
          if (round.difficultyBump) {
            setChallengeRound(round);
            return;
          }
          enterPlay(round);
        },
      }
    );
    // [BUG-542] Use .mutate (stable ref) instead of whole mutation result
  }, [activityType, enterPlay, generateRoundMutate, subjectId]);

  useEffect(() => {
    if (!activityType) {
      router.replace('/(app)/quiz' as never);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    startRound();
  }, [activityType, router, startRound]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingMessageIndex(
        (current) => (current + 1) % LOADING_MESSAGES.length
      );
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // [ASSUMP-F4] After 20s of loading, show a "taking longer than usual"
  // nudge alongside the Cancel button so users don't assume the app hung.
  useEffect(() => {
    if (!generateRound.isPending) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 20000);
    return () => clearTimeout(timer);
  }, [generateRound.isPending]);

  // [BUG-UX-QUIZ-TIMEOUT] Hard 30s timeout: transition to an explicit error
  // panel if the mutation has not resolved. The soft nudge (timedOut) only
  // appends a text hint — this gives a full Retry / Go Back escape hatch.
  useEffect(() => {
    if (!generateRound.isPending) {
      setHardTimedOut(false);
      return undefined;
    }
    const timer = setTimeout(
      () => setHardTimedOut(true),
      ROUND_GENERATION_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [generateRound.isPending]);

  // [F-Q-12] Removed the 3s auto-advance timer for challenge banners.
  // Kids reading slowly may miss the banner entirely if it auto-dismisses.
  // The Start button is the only way to advance — explicit user action.

  if (!activityType) {
    return <View className="flex-1 bg-background" />;
  }

  if (challengeRound) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="quiz-challenge-banner-screen"
      >
        <View
          className="w-full rounded-card border border-primary bg-primary-soft p-6"
          accessible
          accessibilityRole="alert"
          accessibilityLabel="Challenge round. This round is harder than usual."
          testID="quiz-challenge-banner"
        >
          <Text className="text-center text-h3 font-bold text-text-primary">
            Challenge round
          </Text>
          <Text className="mt-3 text-center text-body text-text-secondary">
            You&apos;re on a streak. This one is harder.
          </Text>
          <Pressable
            onPress={() => enterPlay(challengeRound)}
            className="mt-5 min-h-[48px] items-center justify-center rounded-button bg-primary px-6 py-3"
            accessibilityRole="button"
            accessibilityLabel="Start challenge round"
            testID="quiz-challenge-start"
          >
            <Text className="text-body font-semibold text-text-inverse">
              Start
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // [BUG-UX-QUIZ-TIMEOUT] Hard timeout: mutation is stuck — show a full error
  // panel. Retry resets the flag and fires startRound() so the user gets a
  // fresh attempt without navigating away.
  if (hardTimedOut) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="quiz-launch-error"
      >
        <ErrorFallback
          variant="centered"
          title="Quiz is taking too long"
          message="Generating the round took longer than expected. Check your connection and try again."
          primaryAction={{
            label: 'Retry',
            onPress: () => {
              setHardTimedOut(false);
              startRound();
            },
            testID: 'quiz-launch-retry',
          }}
          secondaryAction={{
            label: 'Go Back',
            onPress: () => goBackOrReplace(router, '/(app)/quiz'),
            testID: 'quiz-launch-back',
          }}
          testID="quiz-launch-error-fallback"
        />
      </View>
    );
  }

  if (generateRound.isError) {
    // [ASSUMP-F3] [IMP-2] Hide the Retry button when retrying can't possibly
    // help (quota exhausted, consent required). Classify on the typed error
    // code from assertOk's ApiResponseError — never string-match on the
    // formatted message, which can drift without test coverage.
    const errorCode =
      generateRound.error instanceof Error &&
      'code' in generateRound.error &&
      typeof (generateRound.error as { code?: string }).code === 'string'
        ? (generateRound.error as { code: string }).code
        : undefined;
    const isUnretryable =
      errorCode === 'QUOTA_EXCEEDED' ||
      errorCode === 'FORBIDDEN' ||
      (errorCode != null && errorCode.startsWith('CONSENT_'));

    // [F-Q-01] Route through friendlyErrorMessage so the panel never renders
    // raw JSON envelopes or verbose API payloads. errorCode is classified first
    // (before formatting) to avoid string-matching on formatted output.
    const rawMessage =
      generateRound.error instanceof Error && generateRound.error.message
        ? generateRound.error.message
        : 'Try again, or head back and pick a different activity.';
    const errorMessage = friendlyErrorMessage(errorCode, rawMessage);

    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="quiz-launch-error"
      >
        <ErrorFallback
          variant="centered"
          title="Couldn't create a round"
          message={errorMessage}
          primaryAction={
            isUnretryable
              ? undefined
              : {
                  label: 'Retry',
                  onPress: startRound,
                  testID: 'quiz-launch-retry',
                }
          }
          secondaryAction={{
            label: 'Go Back',
            onPress: () => goBackOrReplace(router, '/(app)/quiz'),
            testID: 'quiz-launch-back',
          }}
          testID="quiz-launch-error-fallback"
        />
      </View>
    );
  }

  // [ASSUMP-F2] Loading state gives the user a Cancel escape hatch in case
  // the mutation hangs (slow network, stuck LLM). Avoids a dead-end where
  // Android users have only hardware back.
  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      testID="quiz-launch-loading"
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text className="mt-4 text-body text-text-secondary">
        {LOADING_MESSAGES[loadingMessageIndex]}
      </Text>
      {timedOut ? (
        <Text
          className="mt-2 text-center text-body-sm text-text-secondary"
          testID="quiz-launch-timed-out"
        >
          This is taking longer than usual — tap Cancel if you&apos;d rather try
          again later.
        </Text>
      ) : null}
      <Pressable
        onPress={() => goBackOrReplace(router, '/(app)/quiz')}
        className="mt-10 min-h-[44px] items-center justify-center rounded-button px-6 py-3"
        testID="quiz-launch-cancel"
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text className="text-body-sm font-semibold text-text-secondary">
          Cancel
        </Text>
      </Pressable>
    </View>
  );
}
