import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { ParentDashboardSummary } from '../../components/coaching';
import type { RetentionStatus } from '../../components/progress';
import { useDashboard } from '../../hooks/use-dashboard';

function CardSkeleton(): React.ReactNode {
  return (
    <View
      className="bg-coaching-card rounded-card p-5 mt-4"
      testID="dashboard-skeleton"
    >
      <View className="bg-border rounded h-6 w-1/2 mb-3" />
      <View className="bg-border rounded h-4 w-full mb-2" />
      <View className="bg-border rounded h-4 w-3/4 mb-4" />
      <View className="flex-row gap-2 mb-4">
        <View className="bg-border rounded-full h-7 w-24" />
        <View className="bg-border rounded-full h-7 w-20" />
      </View>
      <View className="bg-border rounded-button h-12 w-full" />
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { setPersona } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: dashboard, isLoading: dashboardLoading } = useDashboard();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">Dashboard</Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          How your children are doing
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="dashboard-scroll"
      >
        {dashboardLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : dashboard?.children && dashboard.children.length > 0 ? (
          dashboard.children.map(
            (child: {
              profileId: string;
              displayName: string;
              summary: string;
              sessionsThisWeek: number;
              sessionsLastWeek: number;
              trend: string;
              subjects: { name: string; retentionStatus: string }[];
            }) => (
              <ParentDashboardSummary
                key={child.profileId}
                childName={child.displayName}
                summary={child.summary}
                sessionsThisWeek={child.sessionsThisWeek}
                sessionsLastWeek={child.sessionsLastWeek}
                trend={child.trend as 'up' | 'down' | 'stable'}
                subjects={child.subjects.map((s) => ({
                  name: s.name,
                  retentionStatus: s.retentionStatus as RetentionStatus,
                }))}
                onDrillDown={() =>
                  router.push({
                    pathname: '/(parent)/child/[profileId]',
                    params: { profileId: child.profileId },
                  } as never)
                }
              />
            )
          )
        ) : (
          <View className="py-8 items-center">
            <Text className="text-body text-text-secondary">
              No children linked yet
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => setPersona('teen')}
          className="mt-6 items-center py-3 min-h-[44px] justify-center"
        >
          <Text className="text-body-sm text-text-secondary underline">
            Switch to Teen view (demo)
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
