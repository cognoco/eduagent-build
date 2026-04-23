import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type {
  ClientQuizQuestion,
  ValidatedQuestionResult,
} from '@eduagent/schemas';
import { useRoundDetail } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';
import { useThemeColors } from '../../../lib/theme';
import { TimeoutLoader } from '../../../components/common/TimeoutLoader';

/** The completed-round shape returned by GET /quiz/rounds/:id (status=completed).
 *  Extends the base QuizRoundResponse with grading context the client needs
 *  for the history detail screen. */
interface CompletedRoundDetail {
  id: string;
  activityType: string;
  activityLabel?: string;
  theme: string;
  status: 'completed';
  score: number;
  total: number;
  xpEarned: number;
  celebrationTier?: string;
  completedAt?: string;
  questions: (ClientQuizQuestion & {
    correctAnswer?: string;
    acceptedAliases?: string[];
  })[];
  results: ValidatedQuestionResult[];
}

/** Title-case an activity type slug: "guess_who" → "Guess Who" */
function formatActivityType(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function QuizRoundDetailScreen() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { data: round, isLoading, isError, refetch } = useRoundDetail(roundId);

  // B1.3: timeout guard — no bare loading text
  if (isLoading) {
    return (
      <TimeoutLoader
        isLoading={isLoading}
        testID="round-detail-loading"
        primaryAction={{
          label: 'Try Again',
          onPress: () => void refetch(),
        }}
        secondaryAction={{
          label: 'Go Back',
          onPress: () => goBackOrReplace(router, '/(app)/quiz'),
        }}
      />
    );
  }

  if (isError || !round) {
    return (
      <View
        testID="round-detail-error"
        className="flex-1 items-center justify-center p-6"
      >
        <Text className="text-on-surface">Could not load round details</Text>
        <Pressable
          testID="round-detail-back"
          className="mt-4 min-h-[32px] min-w-[32px] items-center justify-center"
          onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>
    );
  }

  // [I4] Cast to the completed-round shape — useRoundDetail returns
  // QuizRoundResponse (the in-progress type), but this screen only renders
  // completed rounds whose API shape includes grading context.
  const detail = round as unknown as CompletedRoundDetail;
  const { questions, results } = detail;

  return (
    <ScrollView testID="round-detail-screen" className="flex-1">
      <View className="p-4">
        <Pressable
          testID="round-detail-back-btn"
          onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
          className="min-h-[32px] min-w-[32px] items-center justify-center self-start"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-on-surface mt-4 text-xl font-bold">
          {detail.theme}
        </Text>
        <Text className="text-on-surface-muted">
          {/* [F-036b] Prefer server-formatted activityLabel; local
              formatActivityType stays as a fallback for older cached rounds
              that predate the field. */}
          {detail.activityLabel ??
            formatActivityType(detail.activityType ?? '')}{' '}
          · {detail.score}/{detail.total}
        </Text>
      </View>
      {questions.map((q, i: number) => {
        const result = results.find((r) => r.questionIndex === i);
        return (
          <View
            key={i}
            testID={`round-detail-question-${i}`}
            className="bg-surface-elevated mx-4 mb-3 rounded-xl p-4"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-on-surface font-semibold">Q{i + 1}</Text>
              <Text className={result?.correct ? 'text-success' : 'text-error'}>
                {result?.correct ? 'Correct' : 'Wrong'}
              </Text>
            </View>
            {q.type === 'capitals' && (
              <Text className="text-on-surface mt-1">
                Capital of {q.country}
              </Text>
            )}
            {q.type === 'vocabulary' && (
              <Text className="text-on-surface mt-1">Translate: {q.term}</Text>
            )}
            {q.type === 'guess_who' && (
              <Text className="text-on-surface mt-1">Guess Who</Text>
            )}
            {result && (
              <Text className="text-on-surface-muted mt-1 text-sm">
                Your answer: {result.answerGiven}
              </Text>
            )}
            {q.correctAnswer && (
              <Text className="text-success mt-1 text-sm">
                Correct answer: {q.correctAnswer}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
