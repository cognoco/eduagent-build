import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
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

function DemoBanner(): React.ReactNode {
  return (
    <View
      className="bg-accent/10 border border-accent/30 rounded-card px-4 py-3 mt-2 mb-2"
      testID="demo-banner"
      accessibilityRole="header"
      accessibilityLabel="Preview mode: this is sample data showing what your dashboard will look like once your child starts learning"
    >
      <Text className="text-body-sm font-semibold text-accent">Preview</Text>
      <Text className="text-caption text-text-secondary mt-1">
        This is sample data. Once your child starts learning, you will see their
        real progress here.
      </Text>
    </View>
  );
}

function renderChildCards(
  children: {
    profileId: string;
    displayName: string;
    summary: string;
    sessionsThisWeek: number;
    sessionsLastWeek: number;
    totalTimeThisWeek: number;
    totalTimeLastWeek: number;
    trend: string;
    retentionTrend?: string;
    subjects: { name: string; retentionStatus: string }[];
  }[],
  onDrillDown: (profileId: string) => void
): React.ReactNode {
  return children.map((child) => (
    <ParentDashboardSummary
      key={child.profileId}
      childName={child.displayName}
      summary={child.summary}
      sessionsThisWeek={child.sessionsThisWeek}
      sessionsLastWeek={child.sessionsLastWeek}
      totalTimeThisWeek={child.totalTimeThisWeek}
      totalTimeLastWeek={child.totalTimeLastWeek}
      trend={child.trend as 'up' | 'down' | 'stable'}
      retentionTrend={
        child.retentionTrend as 'improving' | 'declining' | 'stable' | undefined
      }
      subjects={child.subjects.map((s) => ({
        name: s.name,
        retentionStatus: s.retentionStatus as RetentionStatus,
      }))}
      onDrillDown={() => onDrillDown(child.profileId)}
    />
  ));
}

export default function DashboardScreen() {
  const router = useRouter();
  const { setPersona } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    refetch,
    isRefetching,
  } = useDashboard();

  const isDemo = dashboard?.demoMode === true;

  const handleDrillDown = (profileId: string): void => {
    if (isDemo) {
      Alert.alert(
        'Preview Mode',
        "Link your child's account to see real data.",
        [{ text: 'OK' }]
      );
      return;
    }
    router.push({
      pathname: '/(parent)/child/[profileId]',
      params: { profileId },
    } as never);
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">Home</Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {isDemo
            ? "Here's what your dashboard will look like"
            : 'How your children are doing'}
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="dashboard-scroll"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
          />
        }
      >
        {dashboardLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : dashboard?.children && dashboard.children.length > 0 ? (
          <>
            {isDemo && <DemoBanner />}
            {renderChildCards(dashboard.children, handleDrillDown)}
            {isDemo && (
              <Pressable
                onPress={() => router.push('/(parent)/more' as never)}
                className="bg-accent rounded-button mt-6 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Link your child's account to get started"
                testID="demo-link-child-cta"
              >
                <Text className="text-body font-semibold text-white">
                  Link your child's account
                </Text>
              </Pressable>
            )}
          </>
        ) : (
          <View className="py-8 items-center">
            <Text className="text-body text-text-secondary">
              No children linked yet
            </Text>
          </View>
        )}

        {__DEV__ && (
          <Pressable
            onPress={() => setPersona('teen')}
            className="mt-6 items-center py-3 min-h-[44px] justify-center"
          >
            <Text className="text-body-sm text-text-secondary underline">
              Switch to Teen view (demo)
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
