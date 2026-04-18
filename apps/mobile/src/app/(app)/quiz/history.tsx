import { View, Text, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useRecentRounds } from '../../../hooks/use-quiz';
import { goBackOrReplace } from '../../../lib/navigation';

// [F-037] Friendly date label — "Today" / "Yesterday" / locale long date.
function formatDateHeader(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function QuizHistoryScreen() {
  const router = useRouter();
  const { data: rounds, isLoading } = useRecentRounds();

  if (isLoading) {
    return (
      <View
        testID="quiz-history-loading"
        className="flex-1 items-center justify-center"
      >
        <Text className="text-on-surface-muted">Loading history...</Text>
      </View>
    );
  }

  if (!rounds || rounds.length === 0) {
    return (
      <View
        testID="quiz-history-empty"
        className="flex-1 items-center justify-center p-6"
      >
        <Text className="text-on-surface text-lg font-semibold">
          No rounds played yet
        </Text>
        <Text className="text-on-surface-muted mt-2 text-center">
          Try a quiz to see your history here!
        </Text>
        <Pressable
          testID="quiz-history-try-quiz"
          className="bg-primary mt-4 rounded-xl px-6 py-3"
          onPress={() => router.push('/(app)/quiz')}
        >
          <Text className="text-on-primary font-semibold">Try a Quiz</Text>
        </Pressable>
      </View>
    );
  }

  const grouped = new Map<string, typeof rounds>();
  for (const round of rounds) {
    const dateKey = round.completedAt.slice(0, 10);
    const group = grouped.get(dateKey) ?? [];
    group.push(round);
    grouped.set(dateKey, group);
  }

  const sections = Array.from(grouped.entries()).map(([date, items]) => ({
    date,
    items,
  }));

  return (
    <View testID="quiz-history-screen" className="flex-1">
      <View className="flex-row items-center p-4">
        <Pressable
          testID="quiz-history-back"
          onPress={() => goBackOrReplace(router, '/(app)/practice')}
        >
          <Text className="text-primary">Back</Text>
        </Pressable>
        <Text className="text-on-surface ml-4 text-xl font-bold">
          Quiz History
        </Text>
      </View>
      <FlatList
        data={sections}
        keyExtractor={(section) => section.date}
        renderItem={({ item: section }) => (
          <View className="mb-4">
            <Text className="text-on-surface-muted px-4 py-2 text-sm font-medium">
              {formatDateHeader(section.date)}
            </Text>
            {section.items.map((round) => (
              <Pressable
                key={round.id}
                testID={`quiz-history-row-${round.id}`}
                className="bg-surface-elevated mx-4 mb-2 rounded-xl p-4"
                onPress={() => router.push(`/(app)/quiz/${round.id}`)}
              >
                <Text className="text-on-surface font-semibold capitalize">
                  {round.activityType.replace('_', ' ')}
                </Text>
                <Text className="text-on-surface-muted text-sm">
                  {round.theme}
                </Text>
                <Text className="text-on-surface mt-1">
                  {round.score}/{round.total} · {round.xpEarned} XP
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
    </View>
  );
}
