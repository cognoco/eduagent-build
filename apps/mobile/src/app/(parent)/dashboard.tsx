import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { DashboardCard } from '../../components/DashboardCard';
import { useDashboard } from '../../hooks/use-dashboard';

type RetentionStatus = 'strong' | 'fading' | 'weak';

export default function DashboardScreen() {
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
      >
        {dashboardLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator />
          </View>
        ) : dashboard?.children && dashboard.children.length > 0 ? (
          dashboard.children.map(
            (child: {
              profileId: string;
              displayName: string;
              summary: string;
              sessionsThisWeek: number;
              sessionsLastWeek: number;
              subjects: { name: string; retentionStatus: string }[];
            }) => (
              <DashboardCard
                key={child.profileId}
                name={child.displayName}
                summary={child.summary}
                sessions={child.sessionsThisWeek}
                lastWeekSessions={child.sessionsLastWeek}
                subjects={child.subjects.map((s) => ({
                  name: s.name,
                  retention: s.retentionStatus as RetentionStatus,
                }))}
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
