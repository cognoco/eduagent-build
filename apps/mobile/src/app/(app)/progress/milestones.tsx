import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback } from '../../../components/common';
import { MilestoneCard } from '../../../components/progress';
import { useProgressMilestones } from '../../../hooks/use-progress';
import { goBackOrReplace } from '../../../lib/navigation';

function SkeletonRow(): React.ReactElement {
  return (
    <View className="bg-surface rounded-card p-4 mt-3 flex-row items-center">
      <View className="bg-border rounded w-8 h-8 me-3" />
      <View className="flex-1">
        <View className="bg-border rounded h-4 w-2/3 mb-2" />
        <View className="bg-border rounded h-3 w-1/4" />
      </View>
    </View>
  );
}

export default function MilestonesListScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    data: milestones,
    isLoading,
    isError,
    refetch,
  } = useProgressMilestones(50);

  const isEmpty = !isLoading && !isError && (milestones?.length ?? 0) === 0;
  const milestoneCount = milestones?.length ?? 0;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/progress' as const)}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="milestones-back"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            Your Milestones
          </Text>
          {!isLoading && !isError && milestoneCount > 0 ? (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {milestoneCount} milestone
              {milestoneCount !== 1 ? 's' : ''} earned
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : isError ? (
          <View testID="milestones-error">
            <ErrorFallback
              title="We couldn't load your milestones"
              message="Check your connection and try again."
              primaryAction={{
                label: 'Try again',
                onPress: () => void refetch(),
                testID: 'milestones-retry',
              }}
              secondaryAction={{
                label: 'Go back',
                onPress: () =>
                  goBackOrReplace(router, '/(app)/progress' as const),
                testID: 'milestones-go-back',
              }}
              testID="milestones-error-fallback"
            />
          </View>
        ) : isEmpty ? (
          <View
            className="bg-surface rounded-card p-5 mt-4 items-center"
            testID="milestones-empty"
          >
            <Text className="text-2xl mb-3">🎯</Text>
            <Text className="text-h3 font-semibold text-text-primary text-center">
              No milestones yet
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              Complete sessions and master topics to earn your first milestone.
            </Text>
            <Pressable
              onPress={() =>
                goBackOrReplace(router, '/(app)/progress' as const)
              }
              className="bg-background rounded-button px-5 py-3 mt-4"
              accessibilityRole="button"
              accessibilityLabel="Go back to Journey"
              testID="milestones-empty-back"
            >
              <Text className="text-body font-semibold text-text-primary">
                Go back
              </Text>
            </Pressable>
          </View>
        ) : (
          milestones?.map((milestone) => (
            <View key={milestone.id} className="mt-3">
              <MilestoneCard milestone={milestone} />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
