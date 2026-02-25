import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RetentionSignal,
  type RetentionStatus,
} from '../../../../components/progress';
import {
  useChildDetail,
  useChildSessions,
} from '../../../../hooks/use-dashboard';
import {
  useChildConsentStatus,
  useRevokeConsent,
  useRestoreConsent,
} from '../../../../hooks/use-consent';

function SubjectSkeleton(): React.ReactNode {
  return (
    <View className="bg-surface rounded-card p-4 mt-3">
      <View className="bg-border rounded h-5 w-1/2 mb-2" />
      <View className="bg-border rounded h-4 w-1/3" />
    </View>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '--';
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const GRACE_PERIOD_DAYS = 7;

function getGracePeriodDaysRemaining(respondedAt: string | null): number {
  if (!respondedAt) return GRACE_PERIOD_DAYS;
  const revokedDate = new Date(respondedAt);
  const deadline = new Date(revokedDate);
  deadline.setDate(deadline.getDate() + GRACE_PERIOD_DAYS);
  const now = new Date();
  const msRemaining = deadline.getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}

export default function ChildDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { data: child, isLoading } = useChildDetail(profileId);
  const { data: sessions, isLoading: sessionsLoading } =
    useChildSessions(profileId);
  const { data: consentData } = useChildConsentStatus(profileId);
  const revokeConsent = useRevokeConsent(profileId);
  const restoreConsent = useRestoreConsent(profileId);

  const isWithdrawn = consentData?.consentStatus === 'WITHDRAWN';
  const daysRemaining = isWithdrawn
    ? getGracePeriodDaysRemaining(consentData.respondedAt)
    : 0;

  const handleWithdrawConsent = useCallback(() => {
    const childName = child?.displayName ?? 'this child';
    Alert.alert(
      `Withdraw consent for ${childName}?`,
      `${childName}'s account and all learning data will be deleted after a 7-day grace period.\n\nYou can reverse this within 7 days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeConsent.mutateAsync();
            } catch {
              Alert.alert(
                'Error',
                'Could not withdraw consent. Please try again.'
              );
            }
          },
        },
      ]
    );
  }, [child?.displayName, revokeConsent]);

  const handleCancelDeletion = useCallback(async () => {
    try {
      await restoreConsent.mutateAsync();
    } catch {
      Alert.alert('Error', 'Could not cancel deletion. Please try again.');
    }
  }, [restoreConsent]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 py-2 pr-2"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          testID="back-button"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {child?.displayName ?? 'Loading...'}
          </Text>
          {child && (
            <Text className="text-body-sm text-text-secondary mt-0.5">
              {child.summary}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="child-detail-scroll"
      >
        {isLoading ? (
          <>
            <SubjectSkeleton />
            <SubjectSkeleton />
            <SubjectSkeleton />
          </>
        ) : child?.subjects && child.subjects.length > 0 ? (
          <>
            <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
              Subjects
            </Text>
            {child.subjects.map((subject) => (
              <Pressable
                key={subject.name}
                onPress={() =>
                  router.push({
                    pathname:
                      '/(parent)/child/[profileId]/subjects/[subjectId]',
                    params: {
                      profileId: profileId!,
                      subjectId: subject.name,
                    },
                  } as never)
                }
                className="bg-surface rounded-card p-4 mt-3 flex-row items-center justify-between"
                accessibilityLabel={`View ${subject.name} details`}
                accessibilityRole="button"
                testID={`subject-card-${subject.name}`}
              >
                <Text className="text-body font-medium text-text-primary">
                  {subject.name}
                </Text>
                <RetentionSignal
                  status={subject.retentionStatus as RetentionStatus}
                />
              </Pressable>
            ))}
          </>
        ) : (
          <View className="py-8 items-center">
            <Text className="text-body text-text-secondary">
              No subjects yet
            </Text>
          </View>
        )}

        {/* Recent Sessions */}
        <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
          Recent Sessions
        </Text>
        {sessionsLoading ? (
          <>
            <SubjectSkeleton />
            <SubjectSkeleton />
          </>
        ) : sessions && sessions.length > 0 ? (
          sessions.map((session) => (
            <Pressable
              key={session.sessionId}
              onPress={() =>
                router.push({
                  pathname: '/(parent)/child/[profileId]/session/[sessionId]',
                  params: {
                    profileId: profileId!,
                    sessionId: session.sessionId,
                  },
                } as never)
              }
              className="bg-surface rounded-card p-4 mt-3"
              accessibilityLabel={`View session from ${formatSessionDate(
                session.startedAt
              )}`}
              accessibilityRole="button"
              testID={`session-card-${session.sessionId}`}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-body font-medium text-text-primary">
                  {formatSessionDate(session.startedAt)}
                </Text>
                <Text className="text-caption text-text-secondary">
                  {session.sessionType}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-caption text-text-secondary mr-4">
                  {session.exchangeCount} exchanges
                </Text>
                <Text className="text-caption text-text-secondary">
                  {formatDuration(session.durationSeconds)}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <View className="py-4 items-center">
            <Text className="text-body text-text-secondary">
              No sessions yet
            </Text>
          </View>
        )}

        {/* Consent Management */}
        {consentData?.consentStatus != null && (
          <View className="mt-8 mb-4" testID="consent-section">
            <Text className="text-h3 font-semibold text-text-primary mb-2">
              {child?.displayName
                ? `${child.displayName}'s Account`
                : 'Account'}
            </Text>

            {isWithdrawn ? (
              <View
                className="bg-error/10 rounded-card p-4"
                testID="grace-period-banner"
              >
                <Text className="text-body font-semibold text-error mb-1">
                  Deletion pending
                </Text>
                <Text className="text-body-sm text-text-secondary mb-3">
                  {daysRemaining > 0
                    ? `Account and all learning data will be deleted in ${daysRemaining} ${
                        daysRemaining === 1 ? 'day' : 'days'
                      }.`
                    : 'Deletion is being processed.'}
                </Text>
                {daysRemaining > 0 && (
                  <Pressable
                    onPress={handleCancelDeletion}
                    disabled={restoreConsent.isPending}
                    className="bg-primary rounded-lg py-3 items-center"
                    accessibilityLabel="Cancel deletion"
                    accessibilityRole="button"
                    testID="cancel-deletion-button"
                  >
                    <Text className="text-body font-semibold text-on-primary">
                      {restoreConsent.isPending
                        ? 'Cancelling...'
                        : 'Cancel Deletion'}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : consentData.consentStatus === 'CONSENTED' ? (
              <Pressable
                onPress={handleWithdrawConsent}
                disabled={revokeConsent.isPending}
                className="border border-error rounded-lg py-3 items-center"
                accessibilityLabel="Withdraw consent"
                accessibilityRole="button"
                testID="withdraw-consent-button"
              >
                <Text className="text-body font-semibold text-error">
                  {revokeConsent.isPending
                    ? 'Withdrawing...'
                    : 'Withdraw Consent'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
