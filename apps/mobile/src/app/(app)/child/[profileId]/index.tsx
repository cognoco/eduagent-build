import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { platformAlert } from '../../../../lib/platform-alert';
import { useCallback, useMemo, useState } from 'react';
import type { AccommodationMode } from '@eduagent/schemas';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../../../../lib/profile';
import {
  GrowthChart,
  RetentionSignal,
  SubjectCard,
  hasSubjectActivity,
  type RetentionStatus,
} from '../../../../components/progress';
import {
  useChildDetail,
  useChildSessions,
} from '../../../../hooks/use-dashboard';
import {
  useChildInventory,
  useChildProgressHistory,
  useChildReports,
} from '../../../../hooks/use-progress';
import { useCelebration } from '../../../../hooks/use-celebration';
import {
  useMarkCelebrationsSeen,
  usePendingCelebrations,
} from '../../../../hooks/use-celebrations';
import {
  useChildConsentStatus,
  useRevokeConsent,
  useRestoreConsent,
} from '../../../../hooks/use-consent';
import {
  useChildLearnerProfile,
  useUpdateAccommodationMode,
} from '../../../../hooks/use-learner-profile';
import { ACCOMMODATION_OPTIONS } from '../../../../lib/accommodation-options';
import { goBackOrReplace } from '../../../../lib/navigation';

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

function formatTimeOnApp(seconds: number | null): string {
  const duration = formatDuration(seconds);
  return duration === '--' ? 'Time on app unavailable' : `${duration} on app`;
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

function formatWeekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function buildGrowthData(
  history:
    | {
        dataPoints: Array<{
          date: string;
          topicsMastered: number;
          vocabularyTotal: number;
        }>;
      }
    | null
    | undefined
) {
  const points = history?.dataPoints ?? [];

  return points.slice(-8).map((point, index) => {
    const previous = points[index - 1];
    return {
      label: formatWeekLabel(point.date),
      value: Math.max(
        0,
        point.topicsMastered - (previous?.topicsMastered ?? 0)
      ),
      secondaryValue:
        point.vocabularyTotal > 0
          ? Math.max(
              0,
              point.vocabularyTotal - (previous?.vocabularyTotal ?? 0)
            )
          : undefined,
    };
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
  const { profiles } = useProfile();
  const { profileId: rawProfileId } = useLocalSearchParams<{
    profileId: string;
  }>();
  // Expo Router can return undefined during navigation transitions even though
  // the generic says `string`. Make the type honest so hooks receive the real
  // runtime type and their `enabled` guards prevent API calls with undefined.
  const profileId = rawProfileId as string | undefined;

  // BUG-382: Client-side IDOR guard — only allow access to profiles owned by this account
  const isOwnedProfile = useMemo(
    () => profiles.some((p) => p.id === profileId),
    [profiles, profileId]
  );
  const {
    data: child,
    isLoading,
    isError,
    refetch,
  } = useChildDetail(profileId);
  const {
    data: sessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useChildSessions(profileId);
  const { data: inventory } = useChildInventory(profileId);
  const { data: history } = useChildProgressHistory(profileId, {
    granularity: 'weekly',
  });
  const visibleSubjects = inventory?.subjects.filter(hasSubjectActivity) ?? [];
  const { data: reports } = useChildReports(profileId);
  const pendingCelebrations = usePendingCelebrations({
    profileId,
    viewer: 'parent',
  });
  const markCelebrationsSeen = useMarkCelebrationsSeen();
  const { data: consentData } = useChildConsentStatus(profileId);
  const { data: learnerProfile } = useChildLearnerProfile(profileId);
  const revokeConsent = useRevokeConsent(profileId);
  const restoreConsent = useRestoreConsent(profileId);
  const updateAccommodation = useUpdateAccommodationMode();
  const { CelebrationOverlay } = useCelebration({
    // Celebrations are best-effort — empty on error is acceptable [SQ-4]
    queue: pendingCelebrations.data ?? [],
    celebrationLevel: 'all',
    audience: 'adult',
    onAllComplete: () => {
      if (!profileId) return;
      markCelebrationsSeen
        .mutateAsync({ viewer: 'parent', profileId })
        .catch((err) => {
          console.warn(
            '[Celebrations] Failed to mark as seen, will retry on next visit:',
            err
          );
        });
    },
  });

  const isWithdrawn = consentData?.consentStatus === 'WITHDRAWN';
  const daysRemaining =
    isWithdrawn && consentData
      ? getGracePeriodDaysRemaining(consentData.respondedAt)
      : 0;

  // [BUG-553] Styled in-app modal replaces window.confirm() on web
  const [withdrawConfirmVisible, setWithdrawConfirmVisible] = useState(false);

  const handleWithdrawConsent = useCallback(() => {
    setWithdrawConfirmVisible(true);
  }, []);

  const handleConfirmWithdraw = useCallback(async () => {
    setWithdrawConfirmVisible(false);
    try {
      await revokeConsent.mutateAsync();
    } catch {
      platformAlert('Error', 'Could not withdraw consent. Please try again.');
    }
  }, [revokeConsent]);

  const handleCancelDeletion = useCallback(async () => {
    try {
      await restoreConsent.mutateAsync();
    } catch {
      platformAlert('Error', 'Could not cancel deletion. Please try again.');
    }
  }, [restoreConsent]);

  const handleAccommodationChange = useCallback(
    (mode: AccommodationMode) => {
      if (!profileId || mode === (learnerProfile?.accommodationMode ?? 'none'))
        return;
      updateAccommodation.mutate(
        { childProfileId: profileId, accommodationMode: mode },
        {
          onError: () => {
            platformAlert('Could not save setting', 'Please try again.');
          },
        }
      );
    },
    [profileId, learnerProfile?.accommodationMode, updateAccommodation]
  );

  if (!profileId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-profile-no-id"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          Profile not found
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          Unable to load child details.
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/home' as never)}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go home"
          testID="child-profile-no-id-go-home"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Go Home
          </Text>
        </Pressable>
      </View>
    );
  }

  if ((!isLoading && child === null) || isError) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-profile-unavailable"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          Profile no longer available
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          This child profile may have been removed or you may no longer have
          access to it.
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/dashboard' as never)}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back to parent dashboard"
          testID="child-profile-back"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Back to dashboard
          </Text>
        </Pressable>
      </View>
    );
  }

  // BUG-382: Block access to profiles not owned by this account
  if (profileId && profiles.length > 0 && !isOwnedProfile) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          You don&apos;t have access to this profile.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="bg-primary rounded-button px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="me-3 py-2 pe-2"
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

      {/* Streak & XP stats — show as cohesive row when either is nonzero [F-PV-04] */}
      {child && (child.currentStreak > 0 || child.totalXp > 0) && (
        <View
          testID="streak-xp-stats"
          className="mx-5 mt-3 flex-row items-center gap-4"
        >
          {child.currentStreak > 0 && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="flame-outline" size={16} color="#f97316" />
              <Text className="text-text-secondary text-sm">
                {child.currentStreak}-day streak
              </Text>
            </View>
          )}
          {child.totalXp > 0 && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="star-outline" size={16} color="#eab308" />
              <Text className="text-text-secondary text-sm">
                {child.totalXp} XP
              </Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="child-detail-scroll"
      >
        {/* Progress snapshot card — only shown once a snapshot exists */}
        {child?.progress ? (
          <View className="bg-coaching-card rounded-card p-4 mt-4">
            <Text className="text-h3 font-semibold text-text-primary">
              Visible progress
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {child.progress.topicsMastered} topics mastered
              {child.progress.vocabularyTotal > 0
                ? ` • ${child.progress.vocabularyTotal} words known`
                : ''}
            </Text>
            <View className="flex-row flex-wrap gap-2 mt-3">
              {child.progress.weeklyDeltaTopicsMastered != null ? (
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    +{child.progress.weeklyDeltaTopicsMastered} topics this week
                  </Text>
                </View>
              ) : null}
              {child.progress.weeklyDeltaVocabularyTotal != null &&
              child.progress.vocabularyTotal > 0 ? (
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    +{child.progress.weeklyDeltaVocabularyTotal} words
                  </Text>
                </View>
              ) : null}
            </View>
            {child.progress.guidance ? (
              <Text className="text-caption text-text-secondary mt-3">
                {child.progress.guidance}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Reports card — always visible */}
        <View className="bg-surface rounded-card p-4 mt-4">
          <Pressable
            onPress={() => {
              if (!profileId) return;
              router.push({
                pathname: '/(app)/child/[profileId]/reports',
                params: { profileId },
              } as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open monthly reports"
            testID="child-reports-link"
          >
            <Text className="text-body font-semibold text-text-primary">
              Monthly reports
              {reports && reports.length > 0 ? ` (${reports.length})` : ''}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {reports && reports.length > 0
                ? 'A monthly summary of learning activity.'
                : 'Your first report will appear after the first month of activity.'}
            </Text>
          </Pressable>
        </View>

        {history ? (
          <View className="mt-4">
            <GrowthChart
              title="Recent growth"
              subtitle="Weekly changes in topics mastered and vocabulary"
              data={buildGrowthData(history)}
              emptyMessage="Progress becomes easier to spot after a few more sessions."
            />
          </View>
        ) : null}

        {isLoading ? (
          <>
            <SubjectSkeleton />
            <SubjectSkeleton />
            <SubjectSkeleton />
          </>
        ) : inventory?.subjects ? (
          visibleSubjects.length > 0 ? (
            <>
              <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
                Subjects
              </Text>
              {visibleSubjects.map((subject) => (
                <View key={subject.subjectId} className="mt-3">
                  <SubjectCard
                    subject={subject}
                    childProfileId={profileId}
                    subjectId={subject.subjectId}
                    testID={`subject-card-${subject.subjectId}`}
                  />
                </View>
              ))}
            </>
          ) : (
            <View className="py-8 items-center">
              <Text className="text-body text-text-secondary">
                No subjects yet
              </Text>
            </View>
          )
        ) : child?.subjects && child.subjects.length > 0 ? (
          <>
            <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
              Subjects
            </Text>
            {child.subjects.map((subject) => (
              <Pressable
                key={subject.subjectId ?? subject.name}
                disabled={!subject.subjectId}
                onPress={() => {
                  if (!profileId || !subject.subjectId) return;
                  router.push({
                    pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
                    params: {
                      profileId,
                      subjectId: subject.subjectId,
                      subjectName: subject.name,
                    },
                  } as never);
                }}
                className={`bg-surface rounded-card p-4 mt-3 flex-row items-center justify-between${
                  !subject.subjectId ? ' opacity-50' : ''
                }`}
                accessibilityLabel={`View ${subject.name} details`}
                accessibilityRole="button"
                testID={`subject-card-${subject.name}`}
              >
                <View className="flex-1 me-3">
                  <Text className="text-body font-medium text-text-primary">
                    {subject.name}
                  </Text>
                  {subject.rawInput && subject.rawInput !== subject.name && (
                    <Text
                      className="text-caption text-text-secondary mt-0.5"
                      testID={`subject-raw-input-${subject.name}`}
                    >
                      Your child searched for &ldquo;{subject.rawInput}&rdquo;
                    </Text>
                  )}
                </View>
                <RetentionSignal
                  status={subject.retentionStatus as RetentionStatus}
                  parentFacing
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
        ) : sessionsError ? (
          <View className="py-4 items-center">
            <Text className="text-body text-text-secondary text-center mb-3">
              We couldn't load recent sessions right now.
            </Text>
            <Pressable
              onPress={() => void refetchSessions()}
              className="bg-surface rounded-button px-5 py-3 min-h-[48px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Refresh child profile"
              testID="child-profile-refresh"
            >
              <Text className="text-body font-semibold text-text-primary">
                Refresh
              </Text>
            </Pressable>
          </View>
        ) : sessions && sessions.length > 0 ? (
          sessions.map((session) => (
            <Pressable
              key={session.sessionId}
              onPress={() => {
                if (!profileId) return;
                router.push({
                  pathname: '/(app)/child/[profileId]/session/[sessionId]',
                  params: {
                    profileId,
                    sessionId: session.sessionId,
                  },
                } as never);
              }}
              className="bg-surface rounded-card p-4 mt-3"
              accessibilityLabel={`View session from ${formatSessionDate(
                session.startedAt
              )}`}
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
              {session.highlight && (
                <Text
                  className="text-text-tertiary mt-0.5 text-xs"
                  numberOfLines={2}
                >
                  {session.highlight}
                </Text>
              )}
              <Text className="text-caption text-text-secondary">
                {formatTimeOnApp(
                  session.wallClockSeconds ?? session.durationSeconds
                )}
              </Text>
            </Pressable>
          ))
        ) : (
          <View className="mx-4 mt-4 rounded-xl bg-surface p-6">
            <Text className="text-text-secondary text-center text-base">
              No sessions yet. When {child?.displayName ?? 'your child'} starts
              learning, you'll see what they work on here.
            </Text>
          </View>
        )}

        <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
          Mentor Memory
        </Text>
        {/* [F-PV-08] Consent prompt lives on mentor-memory only; show CTA here */}
        {learnerProfile?.memoryConsentStatus === 'pending' && profileId ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/child/[profileId]/mentor-memory',
                params: { profileId },
              } as never)
            }
            className="bg-primary/10 rounded-card p-4 mb-3"
            accessibilityRole="button"
            accessibilityLabel="Set up mentor memory"
            testID="memory-consent-cta"
          >
            <Text className="text-body font-semibold text-primary">
              Set up mentor memory
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              Choose what the mentor remembers about{' '}
              {child?.displayName ?? 'your child'}.
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            if (!profileId) return;
            router.push({
              pathname: '/(app)/child/[profileId]/mentor-memory',
              params: { profileId },
            } as never);
          }}
          className="bg-surface rounded-card p-4 mt-1"
          accessibilityRole="button"
          accessibilityLabel="View what the mentor knows"
          testID="mentor-memory-link"
        >
          <Text className="text-body font-medium text-text-primary">
            What the mentor knows
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Review what has been remembered and adjust privacy controls.
          </Text>
        </Pressable>

        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2 mt-6">
          Learning Accommodation
        </Text>
        <Text className="text-body-sm text-text-secondary mb-2">
          Choose how the mentor adapts its teaching style. This takes effect on
          the next session.
        </Text>
        {ACCOMMODATION_OPTIONS.map((opt) => (
          <Pressable
            key={opt.mode}
            onPress={() => handleAccommodationChange(opt.mode)}
            disabled={updateAccommodation.isPending}
            className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
              (learnerProfile?.accommodationMode ?? 'none') === opt.mode
                ? 'border-2 border-primary'
                : 'border-2 border-transparent'
            }`}
            accessibilityLabel={`${opt.title}: ${opt.description}`}
            accessibilityRole="radio"
            accessibilityState={{
              selected:
                (learnerProfile?.accommodationMode ?? 'none') === opt.mode,
              disabled: updateAccommodation.isPending,
            }}
            testID={`accommodation-mode-${opt.mode}`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-body font-semibold text-text-primary">
                {opt.title}
              </Text>
              {(learnerProfile?.accommodationMode ?? 'none') === opt.mode && (
                <Text className="text-primary text-body font-semibold">
                  Active
                </Text>
              )}
            </View>
            <Text className="text-body-sm text-text-secondary mt-1">
              {opt.description}
            </Text>
          </Pressable>
        ))}

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
                className="bg-danger/10 rounded-card p-4"
                testID="grace-period-banner"
              >
                <Text className="text-body font-semibold text-danger mb-1">
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
                {daysRemaining === 0 && (
                  <Pressable
                    onPress={() => void refetch()}
                    className="bg-surface rounded-lg py-3 items-center"
                    accessibilityLabel="Refresh deletion status"
                    accessibilityRole="button"
                    testID="refresh-grace-period-button"
                  >
                    <Text className="text-body font-semibold text-text-primary">
                      Refresh status
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : consentData.consentStatus === 'CONSENTED' ? (
              <Pressable
                onPress={handleWithdrawConsent}
                disabled={revokeConsent.isPending}
                className="border border-danger rounded-lg py-3 items-center"
                accessibilityLabel="Withdraw consent"
                accessibilityRole="button"
                testID="withdraw-consent-button"
              >
                <Text className="text-body font-semibold text-danger">
                  {revokeConsent.isPending
                    ? 'Withdrawing...'
                    : 'Withdraw Consent'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
      {CelebrationOverlay}

      {/* [BUG-553] Styled confirmation modal — replaces platformAlert which
          falls back to window.confirm() on web. */}
      <Modal
        visible={withdrawConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWithdrawConfirmVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-center items-center px-6"
          onPress={() => setWithdrawConfirmVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Pressable
            className="bg-background rounded-2xl w-full max-w-sm p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-h3 font-bold text-text-primary text-center">
              Withdraw consent for {child?.displayName ?? 'this child'}?
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-3 leading-relaxed">
              {child?.displayName ?? 'This child'}'s account and all learning
              data will be deleted after a 7-day grace period.{'\n\n'}You can
              reverse this within 7 days.
            </Text>
            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => void handleConfirmWithdraw()}
                className="bg-danger rounded-button py-3 items-center min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel="Confirm withdraw consent"
                testID="withdraw-consent-confirm"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  Withdraw
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWithdrawConfirmVisible(false)}
                className="bg-surface rounded-button py-3 items-center min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                testID="withdraw-consent-cancel"
              >
                <Text className="text-body font-semibold text-text-primary">
                  Cancel
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
