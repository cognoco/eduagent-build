import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../lib/profile';
import { useProfileSessions } from '../../hooks/use-progress';

type ReportingComponentProps = {
  profileId: string;
};

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '--';
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

export function RecentSessionsList({
  profileId,
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const sessionsQuery = useProfileSessions(profileId);
  const sessions = sessionsQuery.data ?? [];
  const isActiveProfile = activeProfile?.id === profileId;

  return (
    <View className="mt-6" testID="recent-sessions-list">
      <Text className="text-h3 font-semibold text-text-primary mb-2">
        {t('parentView.index.recentSessions')}
      </Text>
      {sessionsQuery.isLoading ? (
        <>
          <View className="bg-surface rounded-card p-4 mt-3">
            <View className="bg-border rounded h-5 w-1/2 mb-2" />
            <View className="bg-border rounded h-4 w-1/3" />
          </View>
          <View className="bg-surface rounded-card p-4 mt-3">
            <View className="bg-border rounded h-5 w-1/2 mb-2" />
            <View className="bg-border rounded h-4 w-1/3" />
          </View>
        </>
      ) : sessionsQuery.isError ? (
        <View className="py-4 items-center" testID="recent-sessions-error">
          <Text className="text-body text-text-secondary text-center mb-3">
            {t('parentView.index.couldNotLoadSessions')}
          </Text>
          <Pressable
            onPress={() => void sessionsQuery.refetch()}
            className="bg-surface rounded-button px-5 py-3 min-h-[48px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('parentView.index.refreshChildProfile')}
            testID="recent-sessions-retry"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('parentView.index.refresh')}
            </Text>
          </Pressable>
        </View>
      ) : sessions.length > 0 ? (
        sessions.slice(0, 5).map((session) => (
          <Pressable
            key={session.sessionId}
            onPress={() => {
              if (isActiveProfile) {
                router.push(`/session-summary/${session.sessionId}` as never);
                return;
              }
              router.push({
                pathname: '/(app)/child/[profileId]/session/[sessionId]',
                params: {
                  profileId,
                  sessionId: session.sessionId,
                },
              } as never);
            }}
            className="bg-surface rounded-card p-4 mt-3"
            accessibilityLabel={t('parentView.index.viewSessionFrom', {
              date: formatSessionDate(session.startedAt),
            })}
            accessibilityRole="button"
            testID={`session-card-${session.sessionId}`}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-body font-medium text-text-primary">
                {session.homeworkSummary?.displayTitle ??
                  formatSessionDate(session.startedAt)}
              </Text>
              <Text className="text-caption text-text-secondary">
                {session.homeworkSummary
                  ? formatSessionDate(session.startedAt)
                  : session.sessionType}
              </Text>
            </View>
            {session.displaySummary ? (
              <Text className="text-caption text-text-secondary mb-2">
                {session.displaySummary}
              </Text>
            ) : null}
            {session.highlight ? (
              <Text
                className="text-text-tertiary mt-0.5 text-xs"
                numberOfLines={2}
              >
                {session.highlight}
              </Text>
            ) : null}
            <Text className="text-caption text-text-secondary">
              {formatDuration(
                session.wallClockSeconds ?? session.durationSeconds,
              )}
            </Text>
          </Pressable>
        ))
      ) : (
        <View className="mx-4 mt-4 rounded-xl bg-surface p-6">
          <Text className="text-text-secondary text-center text-base">
            {t('parentView.index.noSessionsYet', {
              name:
                activeProfile?.id === profileId
                  ? activeProfile.displayName
                  : t('parentView.index.yourChild'),
            })}
          </Text>
        </View>
      )}
    </View>
  );
}
