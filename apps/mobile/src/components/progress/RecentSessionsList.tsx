import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ChildSession } from '@eduagent/schemas';
import { ErrorFallback } from '../common';
import { EmptyStateCard } from '../common/EmptyStateCard';
import { useProfile } from '../../lib/profile';
import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { buildSessionDetailHref } from '../../lib/session-detail-navigation';
import { useDurationLabel } from '../../hooks/use-time-format';
import { FAMILY_HOME_PATH, goBackOrReplace } from '../../lib/navigation';

type ReportingComponentProps = {
  profileId: string;
  sessionsQuery: UseQueryResult<ChildSession[]>;
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

export function RecentSessionsList({
  profileId,
  sessionsQuery,
}: ReportingComponentProps): React.ReactElement {
  const { t } = useTranslation();
  const durationLabel = useDurationLabel();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const activeProfileRole = useActiveProfileRole();
  const sessions = sessionsQuery.data ?? [];
  const isActiveProfile = activeProfile?.id === profileId;
  const childProfileIdForSessionDetail =
    activeProfileRole === 'impersonated-child' || !isActiveProfile
      ? profileId
      : undefined;
  const emptyAction = isActiveProfile
    ? {
        label: t('parentView.index.startSession', {
          defaultValue: 'Start a session',
        }),
        // [WI-1067] Push ancestor first so router.back() from session returns
        // to the child profile view rather than falling through to Home tab.
        onPress: () => {
          router.push('/(app)/home' as Href);
          router.push('/(app)/session' as Href);
        },
      }
    : {
        label: t('parentView.index.goToCurriculum', {
          defaultValue: 'Go to curriculum',
        }),
        onPress: () =>
          router.push({
            pathname: '/(app)/child/[profileId]/curriculum',
            params: { profileId },
          }),
      };
  const errorEscapeAction = isActiveProfile
    ? {
        label: t('common.goHome'),
        onPress: () => router.push('/(app)/home'),
      }
    : {
        label: t('common.goHome'),
        onPress: () => goBackOrReplace(router, FAMILY_HOME_PATH),
      };

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
        <ErrorFallback
          variant="card"
          title={t('parentView.index.recentSessions')}
          message={t('parentView.index.couldNotLoadSessions')}
          primaryAction={{
            label: t('parentView.index.refresh'),
            onPress: () => void sessionsQuery.refetch(),
            testID: 'recent-sessions-retry',
          }}
          secondaryAction={{
            label: errorEscapeAction.label,
            onPress: errorEscapeAction.onPress,
            testID: 'recent-sessions-go-home',
          }}
          testID="recent-sessions-error"
        />
      ) : sessions.length > 0 ? (
        sessions.slice(0, 5).map((session) => (
          <Pressable
            key={session.sessionId}
            onPress={() => {
              router.push(
                buildSessionDetailHref({
                  sessionId: session.sessionId,
                  childProfileId: childProfileIdForSessionDetail,
                }),
              );
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
              {durationLabel(
                session.durationSeconds ?? session.wallClockSeconds,
              )}
            </Text>
          </Pressable>
        ))
      ) : (
        <EmptyStateCard
          title={t('parentView.index.noSessionsYet', {
            name:
              activeProfile?.id === profileId
                ? activeProfile.displayName
                : t('parentView.index.yourChild'),
          })}
          message={t('progress.recentFocus.empty')}
          primaryAction={{
            ...emptyAction,
            testID: 'recent-sessions-empty-action',
          }}
          testID="recent-sessions-empty-state"
        />
      )}
    </View>
  );
}
