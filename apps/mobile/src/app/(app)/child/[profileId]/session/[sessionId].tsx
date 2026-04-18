import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChildSessionDetail } from '../../../../../hooks/use-dashboard';
import { goBackOrReplace } from '../../../../../lib/navigation';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const mins = Math.round(seconds / 60);
  return mins === 1 ? '1 min' : `${mins} min`;
}

export default function SessionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    profileId: string;
    sessionId: string;
  }>();
  const profileId = Array.isArray(params.profileId)
    ? params.profileId[0]
    : params.profileId;
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;

  const {
    data: session,
    isLoading,
    isError,
    refetch,
  } = useChildSessionDetail(profileId, sessionId);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator testID="loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-text-secondary mb-4 text-center">
          Something went wrong loading this session.
        </Text>
        <Pressable
          testID="retry-session"
          onPress={() => refetch()}
          className="rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <View
        testID="session-not-found"
        className="flex-1 items-center justify-center bg-background px-6"
      >
        <Ionicons name="document-text-outline" size={48} color="#888" />
        <Text className="text-text-secondary mt-4 text-center text-base">
          This session is no longer available.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home')}
          className="mt-4 rounded-lg bg-primary px-6 py-3"
        >
          <Text className="text-text-inverse font-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const duration = formatDuration(
    session.wallClockSeconds ?? session.durationSeconds
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
    >
      {/* Header */}
      <View className="px-4 pt-4">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home')}
          className="mb-4 flex-row items-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} />
        </Pressable>

        <Text className="text-text-primary text-xl font-bold">
          {session.displayTitle}
        </Text>
        <Text className="text-text-secondary mt-1 text-sm">
          {formatDate(session.startedAt)}
        </Text>
      </View>

      {/* Metadata */}
      <View
        testID="session-metadata"
        className="mx-4 mt-4 rounded-xl bg-surface p-4"
      >
        <View className="flex-row justify-between">
          <View>
            <Text className="text-text-secondary text-xs">Duration</Text>
            <Text className="text-text-primary text-base font-medium">
              {duration || '—'}
            </Text>
          </View>
          <View>
            <Text className="text-text-secondary text-xs">Exchanges</Text>
            <Text className="text-text-primary text-base font-medium">
              {session.exchangeCount}
            </Text>
          </View>
          <View>
            <Text className="text-text-secondary text-xs">Type</Text>
            <Text className="text-text-primary text-base font-medium capitalize">
              {session.sessionType}
            </Text>
          </View>
        </View>
      </View>

      {/* Summary */}
      <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
        <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
          Session Summary
        </Text>
        {session.displaySummary ? (
          <Text className="text-text-primary text-base leading-relaxed">
            {session.displaySummary}
          </Text>
        ) : (
          <Text className="text-text-tertiary text-base italic">
            Session summary not available for older sessions
          </Text>
        )}
      </View>

      {/* Homework details */}
      {session.homeworkSummary && (
        <View className="mx-4 mt-4 rounded-xl bg-surface p-4">
          <Text className="text-text-secondary mb-2 text-xs font-medium uppercase">
            Homework Help
          </Text>
          <Text className="text-text-primary text-base leading-relaxed">
            {session.homeworkSummary.summary}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
