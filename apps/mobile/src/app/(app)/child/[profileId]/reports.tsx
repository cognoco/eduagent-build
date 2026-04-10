import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChildReports } from '../../../../hooks/use-progress';

export default function ChildReportsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { data: reports, isLoading } = useChildReports(profileId);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() => router.back()}
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="child-reports-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              Monthly reports
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              A clear record of what your child has learned over time.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              Loading reports...
            </Text>
          </View>
        ) : reports && reports.length > 0 ? (
          reports.map((report) => (
            <Pressable
              key={report.id}
              onPress={() => {
                if (!profileId) return;
                router.push({
                  pathname: '/(app)/child/[profileId]/report/[reportId]',
                  params: { profileId, reportId: report.id },
                } as never);
              }}
              className="bg-surface rounded-card p-4 mt-4"
              accessibilityRole="button"
              accessibilityLabel={`Open ${report.reportMonth} report`}
              testID={`report-card-${report.id}`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 me-3">
                  <Text className="text-body font-semibold text-text-primary">
                    {new Date(
                      `${report.reportMonth}T00:00:00Z`
                    ).toLocaleDateString(undefined, {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {report.headlineStat.label}: {report.headlineStat.value}
                  </Text>
                  <Text className="text-caption text-text-secondary mt-1">
                    {report.headlineStat.comparison}
                  </Text>
                </View>
                {!report.viewedAt ? (
                  <View className="bg-accent/15 rounded-full px-3 py-1">
                    <Text className="text-caption font-semibold text-accent">
                      New
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))
        ) : (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              No monthly reports yet. They will appear here once a month after
              there is enough learning activity to summarize.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
