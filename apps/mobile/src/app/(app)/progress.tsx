import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GrowthChart,
  MilestoneCard,
  SubjectCard,
} from '../../components/progress';
import {
  useProgressHistory,
  useProgressInventory,
  useProgressMilestones,
  useRefreshProgressSnapshot,
} from '../../hooks/use-progress';

function heroCopy(input: { topicsMastered: number; vocabularyTotal: number }): {
  title: string;
  subtitle: string;
} {
  const { topicsMastered, vocabularyTotal } = input;

  if (vocabularyTotal > 0 && topicsMastered === 0) {
    return vocabularyTotal < 20
      ? {
          title: "You're building your language",
          subtitle: `${vocabularyTotal} words and counting.`,
        }
      : {
          title: `You know ${vocabularyTotal} words`,
          subtitle: 'That knowledge is yours now.',
        };
  }

  if (topicsMastered > 0 && vocabularyTotal === 0) {
    return topicsMastered < 20
      ? {
          title: "You're building your knowledge",
          subtitle: `${topicsMastered} topics and counting.`,
        }
      : {
          title: `You've mastered ${topicsMastered} topics`,
          subtitle: 'Your progress keeps stacking up.',
        };
  }

  return {
    title: `You've mastered ${topicsMastered} topics`,
    subtitle: `And you know ${vocabularyTotal} words across your subjects.`,
  };
}

function formatWeekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildGrowthData(
  history:
    | {
        dataPoints: Array<{
          date: string;
          topicsMastered: number;
          vocabularyTotal: number;
        }>;
      }
    | undefined
) {
  const points = history?.dataPoints ?? [];

  return points.slice(-8).map((point, index) => {
    const previous = points[index - 1];
    return {
      label: formatWeekLabel(point.date),
      value: Math.max(
        0,
        point.topicsMastered - (previous?.topicsMastered ?? 0)
      ),
      secondaryValue:
        point.vocabularyTotal > 0
          ? Math.max(
              0,
              point.vocabularyTotal - (previous?.vocabularyTotal ?? 0)
            )
          : undefined,
    };
  });
}

function LoadingBlock(): React.ReactElement {
  return (
    <>
      <View className="bg-coaching-card rounded-card p-5">
        <View className="bg-border rounded h-7 w-2/3 mb-3" />
        <View className="bg-border rounded h-4 w-full mb-2" />
        <View className="bg-border rounded h-4 w-3/4" />
      </View>
      <View className="bg-surface rounded-card p-4 mt-4">
        <View className="bg-border rounded h-5 w-1/3 mb-4" />
        <View className="bg-border rounded h-4 w-full mb-2" />
        <View className="bg-border rounded h-4 w-2/3" />
      </View>
    </>
  );
}

export default function ProgressScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inventoryQuery = useProgressInventory();
  const historyQuery = useProgressHistory({ granularity: 'weekly' });
  const milestonesQuery = useProgressMilestones(5);
  const refreshSnapshot = useRefreshProgressSnapshot();

  const inventory = inventoryQuery.data;
  const hero = heroCopy({
    topicsMastered: inventory?.global.topicsMastered ?? 0,
    vocabularyTotal: inventory?.global.vocabularyTotal ?? 0,
  });

  const growthData = useMemo(
    () => buildGrowthData(historyQuery.data),
    [historyQuery.data]
  );

  const handleRefresh = async () => {
    try {
      await refreshSnapshot.mutateAsync();
    } catch {
      // The existing query error states already communicate failures.
    }

    await Promise.all([
      inventoryQuery.refetch(),
      historyQuery.refetch(),
      milestonesQuery.refetch(),
    ]);
  };

  const isLoading =
    inventoryQuery.isLoading &&
    historyQuery.isLoading &&
    milestonesQuery.isLoading;
  const isEmpty =
    !!inventory &&
    inventory.global.totalSessions === 0 &&
    inventory.subjects.length === 0;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={
              refreshSnapshot.isPending ||
              inventoryQuery.isRefetching ||
              historyQuery.isRefetching
            }
            onRefresh={() => void handleRefresh()}
          />
        }
      >
        <Text className="text-h1 font-bold text-text-primary mt-4">
          My Learning Journey
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1 mb-4">
          Progress that reflects what you actually know.
        </Text>

        {isLoading ? (
          <LoadingBlock />
        ) : isEmpty ? (
          <View className="bg-coaching-card rounded-card p-5">
            <Text className="text-h3 font-semibold text-text-primary">
              Start your first session
            </Text>
            <Text className="text-body text-text-secondary mt-2">
              Your learning journey will grow here once you begin.
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/home' as never)}
              className="bg-primary rounded-button px-4 py-3 mt-4 items-center"
              accessibilityRole="button"
              accessibilityLabel="Start learning"
              testID="progress-start-learning"
            >
              <Text className="text-body font-semibold text-text-inverse">
                Start learning
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className="bg-coaching-card rounded-card p-5">
              <Text className="text-h2 font-bold text-text-primary">
                {hero.title}
              </Text>
              <Text className="text-body text-text-secondary mt-2">
                {hero.subtitle}
              </Text>
              {inventory ? (
                <View className="flex-row flex-wrap gap-2 mt-4">
                  <View className="bg-background rounded-full px-3 py-1.5">
                    <Text className="text-caption font-semibold text-text-primary">
                      {inventory.global.totalSessions} sessions
                    </Text>
                  </View>
                  <View className="bg-background rounded-full px-3 py-1.5">
                    <Text className="text-caption font-semibold text-text-primary">
                      {inventory.global.totalActiveMinutes} active min
                    </Text>
                  </View>
                  <View className="bg-background rounded-full px-3 py-1.5">
                    <Text className="text-caption font-semibold text-text-primary">
                      {inventory.global.currentStreak}-day streak
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
              Your subjects
            </Text>
            {inventory?.subjects.map((subject) => (
              <View key={subject.subjectId} className="mt-3">
                <SubjectCard
                  subject={subject}
                  onPress={() => {
                    router.push({
                      pathname: '/(app)/progress/[subjectId]',
                      params: { subjectId: subject.subjectId },
                    } as never);
                  }}
                  testID={`journey-subject-${subject.subjectId}`}
                />
              </View>
            ))}

            <View className="mt-6">
              <GrowthChart
                title="Your growth"
                subtitle="Weekly changes in topics mastered and vocabulary"
                data={growthData}
                emptyMessage="You just started. Keep going and your growth will appear here."
              />
            </View>

            <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
              Recent milestones
            </Text>
            {milestonesQuery.data && milestonesQuery.data.length > 0 ? (
              milestonesQuery.data.map((milestone) => (
                <View key={milestone.id} className="mt-3">
                  <MilestoneCard milestone={milestone} />
                </View>
              ))
            ) : (
              <View className="bg-surface rounded-card p-4">
                <Text className="text-body-sm text-text-secondary">
                  Keep going. Your milestones will collect here as your
                  knowledge grows.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
