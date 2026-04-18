import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRoundDetail } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';

export default function QuizRoundDetailScreen() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();
  const router = useRouter();
  const { data: round, isLoading, isError } = useRoundDetail(roundId);

  if (isLoading) {
    return (
      <View
        testID="round-detail-loading"
        className="flex-1 items-center justify-center"
      >
        <Text className="text-on-surface-muted">Loading...</Text>
      </View>
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
          className="mt-4"
          onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
        >
          <Text className="text-primary">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const questions = (round as any).questions ?? [];
  const results = ((round as any).results ?? []) as Array<{
    questionIndex: number;
    correct: boolean;
    answerGiven: string;
  }>;

  return (
    <ScrollView testID="round-detail-screen" className="flex-1">
      <View className="p-4">
        <Pressable
          testID="round-detail-back-btn"
          onPress={() => goBackOrReplace(router, '/(app)/quiz/history')}
        >
          <Text className="text-primary">Back</Text>
        </Pressable>
        <Text className="text-on-surface mt-4 text-xl font-bold">
          {(round as any).theme}
        </Text>
        <Text className="text-on-surface-muted capitalize">
          {(round as any).activityType?.replace('_', ' ')} ·{' '}
          {(round as any).score}/{(round as any).total}
        </Text>
      </View>
      {questions.map((q: any, i: number) => {
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
