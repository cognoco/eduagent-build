import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { platformAlert } from '../../../../lib/platform-alert';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AccommodationMode } from '@eduagent/schemas';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../../../../lib/profile';
import {
  GrowthChart,
  RecentSessionsList,
  RetentionSignal,
  ReportsListCard,
  SubjectCard,
  hasSubjectActivity,
  type RetentionStatus,
} from '../../../../components/progress';
import { useChildDetail } from '../../../../hooks/use-dashboard';
import {
  useChildInventory,
  useChildProgressHistory,
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
import {
  ACCOMMODATION_GUIDE,
  ACCOMMODATION_OPTIONS,
} from '../../../../lib/accommodation-options';
import { goBackOrReplace } from '../../../../lib/navigation';
import { SamplePreview } from '../../../../components/parent/SamplePreview';

function SubjectSkeleton(): React.ReactNode {
  return (
    <View className="bg-surface rounded-card p-4 mt-3">
      <View className="bg-border rounded h-5 w-1/2 mb-2" />
      <View className="bg-border rounded h-4 w-1/3" />
    </View>
  );
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
  const { t } = useTranslation();
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
  const { data: inventory } = useChildInventory(profileId);
  const { data: history } = useChildProgressHistory(profileId, {
    granularity: 'weekly',
  });
  const visibleSubjects = inventory?.subjects.filter(hasSubjectActivity) ?? [];
  const pendingCelebrations = usePendingCelebrations({
    profileId,
    viewer: 'parent',
  });
  const markCelebrationsSeen = useMarkCelebrationsSeen();
  const {
    data: consentData,
    isError: isConsentError,
    refetch: refetchConsent,
  } = useChildConsentStatus(profileId);
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
  const [showAccommodationGuide, setShowAccommodationGuide] = useState(false);

  const handleWithdrawConsent = useCallback(() => {
    setWithdrawConfirmVisible(true);
  }, []);

  const handleConfirmWithdraw = useCallback(async () => {
    setWithdrawConfirmVisible(false);
    try {
      await revokeConsent.mutateAsync();
    } catch {
      platformAlert(
        t('parentView.index.errorTitle'),
        t('parentView.index.couldNotWithdrawConsent')
      );
    }
  }, [revokeConsent]);

  const handleCancelDeletion = useCallback(async () => {
    try {
      await restoreConsent.mutateAsync();
    } catch {
      platformAlert(
        t('parentView.index.errorTitle'),
        t('parentView.index.couldNotCancelDeletion')
      );
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
            platformAlert(
              t('parentView.index.couldNotSaveSetting'),
              t('parentView.index.pleaseTryAgain')
            );
          },
        }
      );
    },
    [profileId, learnerProfile?.accommodationMode, updateAccommodation]
  );

  const showHowItsWorking = (() => {
    const mode = learnerProfile?.accommodationMode;
    const updatedAt = learnerProfile?.updatedAt;
    if (!mode || mode === 'none' || !updatedAt) return false;
    const daysSinceUpdate =
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 7;
  })();

  if (!profileId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="child-profile-no-id"
      >
        <Text className="text-h3 font-semibold text-text-primary text-center mb-2">
          {t('parentView.index.profileNotFound')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('parentView.index.unableToLoadChildDetails')}
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/home' as never)}
          className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goHome')}
          testID="child-profile-no-id-go-home"
        >
          <Text className="text-body font-semibold text-text-inverse">
            {t('common.goHome')}
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
          {t('parentView.index.profileNoLongerAvailable')}
        </Text>
        <Text className="text-body text-text-secondary text-center mb-6">
          {t('parentView.index.profileRemovedOrNoAccess')}
        </Text>
        {isError && (
          <Pressable
            onPress={() => void refetch()}
            className="bg-primary rounded-button px-6 py-3 items-center min-h-[48px] justify-center mb-3"
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain')}
            testID="child-profile-retry"
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.tryAgain')}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => router.replace('/(app)/dashboard' as never)}
          className="bg-surface rounded-button px-6 py-3 items-center min-h-[48px] justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('parentView.index.backToDashboard')}
          testID="child-profile-back"
        >
          <Text className="text-body font-semibold text-text-primary">
            {t('parentView.index.backToDashboard')}
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
          {t('parentView.index.noAccessToProfile')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="bg-primary rounded-button px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.back')}
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
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
          testID="back-button"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {child?.displayName ?? t('common.loading')}
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
                {t('parentView.index.dayStreak', {
                  count: child.currentStreak,
                })}
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
              {t('parentView.index.visibleProgress')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {t('parentView.index.topicsMastered', {
                count: child.progress.topicsMastered,
              })}
              {child.progress.vocabularyTotal > 0
                ? ` • ${t('parentView.index.wordsKnown', {
                    count: child.progress.vocabularyTotal,
                  })}`
                : ''}
            </Text>
            <View className="flex-row flex-wrap gap-2 mt-3">
              {child.progress.weeklyDeltaTopicsMastered != null ? (
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    {t('parentView.index.topicsThisWeek', {
                      count: child.progress.weeklyDeltaTopicsMastered,
                    })}
                  </Text>
                </View>
              ) : null}
              {child.progress.weeklyDeltaVocabularyTotal != null &&
              child.progress.vocabularyTotal > 0 ? (
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    {t('parentView.index.wordsThisWeek', {
                      count: child.progress.weeklyDeltaVocabularyTotal,
                    })}
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
        {profileId ? <ReportsListCard profileId={profileId} /> : null}

        {history ? (
          <View className="mt-4">
            {buildGrowthData(history).length < 2 ? (
              <SamplePreview
                unlockMessage={t('parentView.index.progressUnlockMessage')}
              >
                <View className="bg-surface rounded-card p-4">
                  <View className="bg-border rounded h-4 w-1/3 mb-4" />
                  <View className="flex-row items-end gap-3 h-20">
                    {[30, 55, 40, 70, 45, 65, 50, 80].map((height, i) => (
                      <View
                        key={i}
                        className="flex-1 rounded-t-full bg-primary"
                        style={{ height }}
                      />
                    ))}
                  </View>
                </View>
              </SamplePreview>
            ) : (
              <GrowthChart
                title={t('parentView.index.recentGrowth')}
                subtitle={t('parentView.index.recentGrowthSubtitle')}
                data={buildGrowthData(history)}
                emptyMessage={t('parentView.index.progressUnlockMessage')}
              />
            )}
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
                {t('parentView.index.subjects')}
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
                {t('parentView.index.noSubjectsYet')}
              </Text>
            </View>
          )
        ) : child?.subjects && child.subjects.length > 0 ? (
          <>
            <Text className="text-h3 font-semibold text-text-primary mt-4 mb-2">
              {t('parentView.index.subjects')}
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
                accessibilityLabel={t('parentView.index.viewSubjectDetails', {
                  name: subject.name,
                })}
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
                      {t('parentView.index.childSearchedFor', {
                        term: subject.rawInput,
                      })}
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
              {t('parentView.index.noSubjectsYet')}
            </Text>
          </View>
        )}

        {/* Recent Sessions */}
        {profileId ? <RecentSessionsList profileId={profileId} /> : null}

        <Text className="text-h3 font-semibold text-text-primary mt-6 mb-2">
          {child?.displayName
            ? t('parentView.index.mentorMemoryTitle', {
                name: child.displayName,
              })
            : t('parentView.index.mentorMemoryTitleFallback')}
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
            accessibilityLabel={t('parentView.index.setUpMentorMemory')}
            testID="memory-consent-cta"
          >
            <Text className="text-body font-semibold text-primary">
              {t('parentView.index.setUpMentorMemory')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {t('parentView.index.chooseWhatMentorRemembers', {
                name: child?.displayName ?? t('parentView.index.yourChild'),
              })}
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
          accessibilityLabel={t('parentView.index.viewWhatMentorKnows')}
          testID="mentor-memory-link"
        >
          <Text className="text-body font-medium text-text-primary">
            {t('parentView.index.whatTheMentorKnows')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('parentView.index.reviewAndAdjustPrivacy')}
          </Text>
        </Pressable>

        <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
          {child?.displayName
            ? t('parentView.index.learningAccommodationTitle', {
                name: child.displayName,
              })
            : t('parentView.index.learningAccommodationTitleFallback')}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-2">
          {t('parentView.index.learningAccommodationDescription')}
        </Text>
        <Pressable
          onPress={() => setShowAccommodationGuide((v) => !v)}
          className="flex-row items-center mb-3"
          accessibilityRole="button"
          accessibilityLabel={t('parentView.index.toggleDecisionGuide')}
          testID="accommodation-guide-toggle"
        >
          <Ionicons
            name={showAccommodationGuide ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#6b7280"
          />
          <Text className="text-body-sm text-text-secondary ms-1">
            {t('parentView.index.notSureWhichToPick')}
          </Text>
        </Pressable>
        {showAccommodationGuide && (
          <View
            className="bg-surface rounded-card px-4 py-3 mb-3"
            testID="accommodation-guide-content"
          >
            {ACCOMMODATION_GUIDE.map((row) => (
              <View
                key={row.recommendation}
                className="flex-row items-center justify-between py-2"
              >
                <Text className="text-body-sm text-text-secondary flex-1 me-3">
                  {row.condition}
                </Text>
                <Pressable
                  onPress={() => {
                    handleAccommodationChange(row.recommendation);
                    setShowAccommodationGuide(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('parentView.index.pickAccommodation', {
                    mode: row.recommendation,
                  })}
                  testID={`guide-pick-${row.recommendation}`}
                >
                  <Text className="text-primary text-body-sm font-semibold">
                    {ACCOMMODATION_OPTIONS.find(
                      (o) => o.mode === row.recommendation
                    )?.title ?? row.recommendation}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
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
                  {t('parentView.index.active')}
                </Text>
              )}
            </View>
            <Text className="text-body-sm text-text-secondary mt-1">
              {opt.description}
            </Text>
          </Pressable>
        ))}
        <Text
          className="text-caption text-text-secondary mt-1 mb-2"
          testID="accommodation-try-it"
        >
          {t('parentView.index.accommodationTryIt', {
            name: child?.displayName ?? t('parentView.index.yourChild'),
          })}
        </Text>
        {showHowItsWorking && (
          // Non-interactive status badge — analytics detail screen is not yet
          // built. Using View (not Pressable) prevents a silent dead-end tap.
          // Replace with Pressable + onPress once the detail screen exists.
          <View
            className="flex-row items-center gap-2 self-start bg-surface rounded-full px-3 py-1.5 mb-4"
            testID="accommodation-how-working"
          >
            <Ionicons name="analytics-outline" size={14} color="#6b7280" />
            <Text className="text-caption text-text-secondary">
              {t('parentView.index.howItsWorking')}
            </Text>
          </View>
        )}

        {/* UX-DE-L11: surface consent-query errors */}
        {isConsentError && (
          <View className="mt-8 mb-4 bg-surface rounded-card px-4 py-3.5">
            <Text className="text-body text-text-secondary mb-2">
              {t('parentView.index.consentSettingsCouldNotLoad')}
            </Text>
            <Pressable
              onPress={() => void refetchConsent()}
              className="self-start"
              accessibilityRole="button"
              accessibilityLabel={t('parentView.index.retryConsentSettings')}
              testID="consent-retry"
            >
              <Text className="text-body text-primary font-semibold">
                {t('common.retry')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Consent Management */}
        {!isConsentError && consentData?.consentStatus != null && (
          <View className="mt-8 mb-4" testID="consent-section">
            <Text className="text-h3 font-semibold text-text-primary mb-2">
              {child?.displayName
                ? t('parentView.index.accountTitle', {
                    name: child.displayName,
                  })
                : t('parentView.index.accountTitleFallback')}
            </Text>

            {isWithdrawn ? (
              <View
                className="bg-danger/10 rounded-card p-4"
                testID="grace-period-banner"
              >
                <Text className="text-body font-semibold text-danger mb-1">
                  {t('parentView.index.deletionPending')}
                </Text>
                <Text className="text-body-sm text-text-secondary mb-3">
                  {daysRemaining > 0
                    ? t('parentView.index.deletionCountdown', {
                        count: daysRemaining,
                      })
                    : t('parentView.index.deletionProcessing')}
                </Text>
                {daysRemaining > 0 && (
                  <Pressable
                    onPress={handleCancelDeletion}
                    disabled={restoreConsent.isPending}
                    className="bg-primary rounded-lg py-3 items-center"
                    accessibilityLabel={t('parentView.index.cancelDeletion')}
                    accessibilityRole="button"
                    testID="cancel-deletion-button"
                  >
                    <Text className="text-body font-semibold text-on-primary">
                      {restoreConsent.isPending
                        ? t('parentView.index.cancelling')
                        : t('parentView.index.cancelDeletion')}
                    </Text>
                  </Pressable>
                )}
                {daysRemaining === 0 && (
                  <Pressable
                    onPress={() => void refetch()}
                    className="bg-surface rounded-lg py-3 items-center"
                    accessibilityLabel={t(
                      'parentView.index.refreshDeletionStatus'
                    )}
                    accessibilityRole="button"
                    testID="refresh-grace-period-button"
                  >
                    <Text className="text-body font-semibold text-text-primary">
                      {t('parentView.index.refreshStatus')}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : consentData.consentStatus === 'CONSENTED' ? (
              <Pressable
                onPress={handleWithdrawConsent}
                disabled={revokeConsent.isPending}
                className="border border-danger rounded-lg py-3 items-center"
                accessibilityLabel={t('parentView.index.withdrawConsent')}
                accessibilityRole="button"
                testID="withdraw-consent-button"
              >
                <Text className="text-body font-semibold text-danger">
                  {revokeConsent.isPending
                    ? t('parentView.index.withdrawing')
                    : t('parentView.index.withdrawConsent')}
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
          accessibilityLabel={t('common.close')}
        >
          <Pressable
            className="bg-background rounded-2xl w-full max-w-sm p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-h3 font-bold text-text-primary text-center">
              {t('parentView.index.withdrawConsentConfirmTitle', {
                name: child?.displayName ?? t('parentView.index.thisChild'),
              })}
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-3 leading-relaxed">
              {t('parentView.index.withdrawConsentBody', {
                name: child?.displayName ?? t('parentView.index.thisChild'),
              })}
            </Text>
            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => void handleConfirmWithdraw()}
                className="bg-danger rounded-button py-3 items-center min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t(
                  'parentView.index.confirmWithdrawConsent'
                )}
                testID="withdraw-consent-confirm"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('parentView.index.withdraw')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWithdrawConfirmVisible(false)}
                className="bg-surface rounded-button py-3 items-center min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                testID="withdraw-consent-cancel"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
