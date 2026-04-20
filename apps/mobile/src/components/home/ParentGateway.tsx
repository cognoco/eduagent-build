import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DashboardData, Profile } from '@eduagent/schemas';
import { ProfileSwitcher } from '../common';
import { useDashboard } from '../../hooks/use-dashboard';
import { getGreeting } from '../../lib/greeting';
import { IntentCard } from './IntentCard';

function getChildHighlight(dashboard: DashboardData | undefined): string {
  if (!dashboard || dashboard.children.length === 0) {
    return "See how they're doing";
  }

  const child = [...dashboard.children].sort(
    (a, b) => b.totalTimeThisWeek - a.totalTimeThisWeek
  )[0];

  if (!child) {
    return "See how they're doing";
  }

  if (child.totalTimeThisWeek > 0) {
    // [BUG-498] totalTimeThisWeek arrives from the API already in minutes
    // (dashboard.ts maps totalTimeThisWeekMinutes → totalTimeThisWeek).
    // The previous / 60 double-divided, under-reporting by 60×.
    return `${child.displayName} practiced ${child.totalTimeThisWeek} min this week`;
  }

  return `${child.displayName} hasn't practiced this week`;
}

export interface ParentGatewayProps {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (
    profileId: string
  ) => Promise<{ success: boolean; error?: string }>;
  /** Called when the parent taps "Learn something" — host should show the learner view. */
  onLearn?: () => void;
  /** Injectable clock for deterministic testing of time-based greeting. */
  now?: Date;
}

export function ParentGateway({
  profiles,
  activeProfile,
  switchProfile,
  onLearn,
  now,
}: ParentGatewayProps): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: dashboard, isError, refetch } = useDashboard();
  const { title, subtitle } = getGreeting(
    activeProfile?.displayName ?? '',
    now
  );

  return (
    <View className="flex-1 bg-background" testID="parent-gateway">
      {/* Keep the switcher outside the ScrollView so the web dropdown isn't clipped. */}
      <View
        className="flex-row items-center justify-between px-5"
        style={{
          paddingTop: insets.top + 16,
          zIndex: 10,
          elevation: 10,
        }}
      >
        <View className="flex-1 me-3">
          <Text className="text-h2 font-bold text-text-primary">{title}</Text>
          <Text className="text-body text-text-secondary mt-1">{subtitle}</Text>
        </View>
        <ProfileSwitcher
          profiles={profiles}
          activeProfileId={activeProfile?.id}
          onSwitch={switchProfile}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {isError && (
          <Pressable
            onPress={() => void refetch()}
            className="bg-danger/10 rounded-card p-4 mb-4"
            accessibilityRole="button"
            accessibilityLabel="Retry loading dashboard"
            testID="parent-dashboard-error"
          >
            <Text className="text-body-sm text-danger font-semibold mb-1">
              We couldn't load the dashboard
            </Text>
            <Text className="text-caption text-text-secondary">
              Tap to retry
            </Text>
          </Pressable>
        )}

        <View className="gap-4">
          <IntentCard
            title="Check child's progress"
            subtitle={getChildHighlight(dashboard)}
            onPress={() => router.push('/(app)/dashboard' as never)}
            testID="gateway-check-progress"
          />
          <IntentCard
            title="Learn something"
            onPress={() =>
              onLearn ? onLearn() : router.push('/create-subject' as never)
            }
            testID="gateway-learn"
          />
        </View>
      </ScrollView>
    </View>
  );
}
