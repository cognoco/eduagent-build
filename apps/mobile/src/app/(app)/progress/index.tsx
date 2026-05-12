import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { platformAlert } from '../../../lib/platform-alert';
import { classifyApiError } from '../../../lib/format-api-error';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback, TrackedView } from '../../../components/common';
import { formatMinutes } from '../../../lib/format-relative-date';
import {
  CurrentlyWorkingOnCard,
  GrowthChart,
  MilestoneCard,
  MonthlyReportCard,
  RecentSessionsList,
  ReportsListCard,
  WeeklyDeltaChip,
  WeeklyReportCard,
} from '../../../components/progress';
import { ProgressPillRow } from '../../../components/progress/ProgressPillRow';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import {
  useChildInventory,
  useChildProgressHistory,
  useLearningResumeTarget,
  useProgressHistory,
  useProgressInventory,
  useProgressMilestones,
  useProfileReports,
  useProfileSessions,
  useProfileWeeklyReports,
  useRefreshProgressSnapshot,
} from '../../../hooks/use-progress';
import { pushLearningResumeTarget } from '../../../lib/navigation';
import { copyRegisterFor, type CopyRegister } from '../../../lib/copy-register';
import { useLinkedChildren, useProfile } from '../../../lib/profile';
import { buildGrowthData, isProfileStale } from '../../../lib/progress';
import { bucketAccountAge, hashProfileId, track } from '../../../lib/analytics';

function heroCopy(
  input: {
    topicsMastered: number;
    vocabularyTotal: number;
    totalSessions: number;
  },
  register: CopyRegister,
  t: (key: string, opts?: Record<string, unknown>) => string,
): {
  title: string;
  subtitle: string;
} {
  const { topicsMastered, vocabularyTotal, totalSessions } = input;

  if (register === 'child' && topicsMastered > 0) {
    return {
      title: t('progress.register.child.masteredTopicsHero', {
        count: topicsMastered,
      }),
      subtitle:
        vocabularyTotal > 0
          ? t('progress.hero.masteredTopicsAndWords', {
              words: vocabularyTotal,
            })
          : t('progress.register.child.growthSubtitle'),
    };
  }

  // [F-043] Lead with session effort when mastery numbers are still low.
  // Prevents "1 words and counting" for a user with 28 sessions.
  const zeroMastery = topicsMastered === 0 && vocabularyTotal === 0;
  const lowMastery = topicsMastered < 5 && vocabularyTotal < 5;
  if (
    totalSessions > 0 &&
    (zeroMastery || (totalSessions >= 5 && lowMastery))
  ) {
    return {
      title: t('progress.hero.sessionsCompleted', { count: totalSessions }),
      subtitle: t('progress.hero.sessionsCompletedSubtitle'),
    };
  }

  if (vocabularyTotal > 0 && topicsMastered === 0) {
    return vocabularyTotal < 20
      ? {
          title: t('progress.hero.buildingLanguage'),
          subtitle: t('progress.hero.buildingLanguageSubtitle', {
            count: vocabularyTotal,
          }),
        }
      : {
          title: t('progress.hero.knowWords', { count: vocabularyTotal }),
          subtitle: t('progress.hero.knowWordsSubtitle'),
        };
  }

  if (topicsMastered > 0 && vocabularyTotal === 0) {
    return topicsMastered < 20
      ? {
          title: t('progress.hero.buildingKnowledge'),
          subtitle: t('progress.hero.buildingKnowledgeSubtitle', {
            count: topicsMastered,
          }),
        }
      : {
          title: t('progress.hero.masteredTopics', { count: topicsMastered }),
          subtitle: t('progress.hero.masteredTopicsSubtitle'),
        };
  }

  return {
    title: t('progress.hero.masteredTopics', { count: topicsMastered }),
    subtitle: t('progress.hero.masteredTopicsAndWords', {
      words: vocabularyTotal,
    }),
  };
}

const MILESTONE_THRESHOLDS = [1, 3, 5, 10, 25, 50, 100];

export function getNextMilestoneLabel(
  totalSessions: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const next = MILESTONE_THRESHOLDS.find(
    (threshold) => threshold > totalSessions,
  );
  if (next === undefined) {
    return t('progress.milestones.allReached');
  }
  const remaining = next - totalSessions;
  return t('progress.milestones.nextMilestone', { count: remaining });
}

function LoadingBlock(): React.ReactElement {
  return (
    <>
      <View className="bg-coaching-card rounded-card p-5">
        <View className="bg-border rounded h-7 w-2/3 mb-3" />
        <View className="bg-border rounded h-4 w-full mb-2" />
        <View className="bg-border rounded h-4 w-3/4" />
      </View>
      <View className="bg-surface rounded-card p-4 mt-4">
        <View className="bg-border rounded h-5 w-1/3 mb-4" />
        <View className="bg-border rounded h-4 w-full mb-2" />
        <View className="bg-border rounded h-4 w-2/3" />
      </View>
    </>
  );
}

export default function ProgressScreen(): React.ReactElement {
  const { t } = useTranslation();
  const role = useActiveProfileRole();
  const register = copyRegisterFor(role);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const linkedChildren = useLinkedChildren();
  const hasLinked = linkedChildren.length > 0;

  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    () => (hasLinked ? linkedChildren[0]?.id : activeProfile?.id) ?? '',
  );

  // Re-seed when linked children load after mount (query-cache race).
  const mountedWithoutChildren = useRef(!hasLinked);
  useEffect(() => {
    if (mountedWithoutChildren.current && hasLinked && linkedChildren[0]?.id) {
      mountedWithoutChildren.current = false;
      setSelectedProfileId(linkedChildren[0].id);
    }
  }, [hasLinked, linkedChildren]);

  // Re-seed when activeProfile loads after mount (no linked children path).
  useEffect(() => {
    if (!hasLinked && !selectedProfileId && activeProfile?.id) {
      setSelectedProfileId(activeProfile.id);
    }
  }, [hasLinked, selectedProfileId, activeProfile?.id]);

  const isViewingSelf = !hasLinked || selectedProfileId === activeProfile?.id;

  const ownInventoryQuery = useProgressInventory();
  const childInventoryQuery = useChildInventory(
    isViewingSelf ? undefined : selectedProfileId,
    { enabled: !isViewingSelf },
  );
  const inventoryQuery = isViewingSelf
    ? ownInventoryQuery
    : childInventoryQuery;

  const ownHistoryQuery = useProgressHistory({ granularity: 'weekly' });
  const childHistoryQuery = useChildProgressHistory(
    isViewingSelf ? undefined : selectedProfileId,
    { granularity: 'weekly' },
    { enabled: !isViewingSelf },
  );
  const historyQuery = isViewingSelf ? ownHistoryQuery : childHistoryQuery;

  const profileSessionsQuery = useProfileSessions(
    selectedProfileId || activeProfile?.id,
  );
  const monthlyReportsQuery = useProfileReports(
    selectedProfileId || activeProfile?.id,
  );
  const weeklyReportsQuery = useProfileWeeklyReports(
    selectedProfileId || activeProfile?.id,
  );
  const resumeTargetQuery = useLearningResumeTarget();
  const milestonesQuery = useProgressMilestones(5);
  const refreshSnapshot = useRefreshProgressSnapshot();

  const inventory = inventoryQuery.data;
  const hero = heroCopy(
    {
      topicsMastered: inventory?.global.topicsMastered ?? 0,
      vocabularyTotal: inventory?.global.vocabularyTotal ?? 0,
      totalSessions: inventory?.global.totalSessions ?? 0,
    },
    isViewingSelf ? register : 'child',
    t,
  );

  const growthData = useMemo(
    () => buildGrowthData(historyQuery.data ?? undefined),
    [historyQuery.data],
  );

  const handleRefresh = async () => {
    if (isViewingSelf) {
      try {
        await refreshSnapshot.mutateAsync();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t('progress.refreshFailed');
        platformAlert(t('progress.refreshFailedTitle'), message);
      }
    }

    await Promise.all([
      inventoryQuery.refetch(),
      historyQuery.refetch(),
      monthlyReportsQuery.refetch(),
      weeklyReportsQuery.refetch(),
      ...(isViewingSelf ? [milestonesQuery.refetch()] : []),
    ]);
  };

  const handleGlobalResume = useCallback(() => {
    if (resumeTargetQuery.data) {
      pushLearningResumeTarget(router, resumeTargetQuery.data);
      return;
    }
    router.push('/(app)/home' as never);
  }, [resumeTargetQuery.data, router]);

  // [EP15-M2] Gate on primary query only so secondary queries don't cause
  // partial-load flicker when history lands before inventory (or vice versa).
  const isLoading = inventoryQuery.isLoading;
  // [EP15-C5] Primary query failure must surface — otherwise the `?? 0`
  // defaults below render "You've mastered 0 topics" as if the user had
  // a clean slate, which is indistinguishable from an offline/500 error.
  const isError = inventoryQuery.isError;
  const isEmpty =
    !!inventory &&
    inventory.global.totalSessions === 0 &&
    inventory.subjects.length === 0;
  const hasAnyReports =
    (monthlyReportsQuery.data?.length ?? 0) > 0 ||
    (weeklyReportsQuery.data?.length ?? 0) > 0;
  const sessionCount =
    profileSessionsQuery.data?.length ?? inventory?.global.totalSessions ?? 0;
  const lastSessionAt =
    profileSessionsQuery.data?.[0]?.startedAt ??
    inventory?.subjects
      ?.map((subject) => subject.lastSessionAt)
      .filter((value): value is string => typeof value === 'string')
      .sort((a, b) => b.localeCompare(a))[0] ??
    null;
  const isStale =
    !!inventory &&
    !profileSessionsQuery.isLoading &&
    isProfileStale({ sessionCount, lastSessionAt });
  // TODO: D-RP-5 Phase 2 — add 'ineligible' once API provides the discriminator.
  // Until then, no-reports-yet and truly-ineligible both collapse to 'awaiting'.
  const progressSurfaceState: 'empty' | 'awaiting' | 'ready' =
    isEmpty || isStale ? 'empty' : hasAnyReports ? 'ready' : 'awaiting';

  const hasLanguageSubject = inventory?.subjects?.some(
    (s) => s.pedagogyMode === 'four_strands',
  );
  const targetProfileHash = selectedProfileId
    ? hashProfileId(selectedProfileId)
    : null;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      testID="progress-screen"
    >
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={
              refreshSnapshot.isPending ||
              inventoryQuery.isRefetching ||
              historyQuery.isRefetching
            }
            onRefresh={() => void handleRefresh()}
          />
        }
      >
        <Text className="text-h1 font-bold text-text-primary mt-4">
          {t('progress.pageTitle')}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1 mb-4">
          {t('progress.pageSubtitle')}
        </Text>

        {hasLinked ? (
          <ProgressPillRow
            childrenProfiles={linkedChildren}
            selectedProfileId={selectedProfileId}
            ownProfileId={activeProfile?.id}
            onSelect={setSelectedProfileId}
          />
        ) : null}

        {isLoading ? (
          <LoadingBlock />
        ) : isError && !inventory ? (
          <ErrorFallback
            title={t('progress.error.loadTitle')}
            message={
              classifyApiError(inventoryQuery.error).category === 'network'
                ? t('progress.error.loadMessageNetwork')
                : t('progress.error.loadMessageServer')
            }
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void inventoryQuery.refetch(),
              testID: 'progress-error-retry',
            }}
            secondaryAction={{
              label: t('progress.error.goHome'),
              onPress: () => router.push('/(app)/home' as never),
              testID: 'progress-error-home',
            }}
            testID="progress-error-state"
          />
        ) : progressSurfaceState === 'empty' ? (
          <View className="bg-coaching-card rounded-card p-5">
            <Text className="text-h3 font-semibold text-text-primary">
              {t('progress.empty.title')}
            </Text>
            <Text className="text-body text-text-secondary mt-2">
              {t('progress.empty.subtitle')}
            </Text>
            <Pressable
              onPress={() => {
                if (activeProfile) {
                  track('progress_empty_state_cta_tapped', {
                    profile_id_hash: hashProfileId(activeProfile.id),
                    account_age_bucket: bucketAccountAge(
                      activeProfile.createdAt,
                    ),
                  });
                }
                router.push('/(app)/library' as never);
              }}
              className="bg-primary rounded-button px-4 py-3 mt-4 items-center"
              accessibilityRole="button"
              accessibilityLabel={t('progress.startLearning')}
              testID="progress-start-learning"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('progress.startLearning')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className="bg-coaching-card rounded-card p-5">
              <Text className="text-h2 font-bold text-text-primary">
                {hero.title}
              </Text>
              <Text className="text-body text-text-secondary mt-2">
                {hero.subtitle}
              </Text>
              {inventory ? (
                <View className="flex-row flex-wrap gap-2 mt-4">
                  <View className="bg-background rounded-full px-3 py-1.5">
                    <Text className="text-caption font-semibold text-text-primary">
                      {t('progress.stats.sessions', {
                        count: inventory.global.totalSessions,
                      })}
                    </Text>
                  </View>
                  <View className="bg-background rounded-full px-3 py-1.5">
                    <Text className="text-caption font-semibold text-text-primary">
                      {/* [M5] || intentional: totalWallClockMinutes defaults to 0 for
                          pre-F-045 snapshots; falsy-fallback shows activeMinutes. */}
                      {formatMinutes(
                        inventory.global.totalWallClockMinutes ||
                          inventory.global.totalActiveMinutes,
                      )}
                    </Text>
                  </View>
                  <View
                    testID="progress-streak-count"
                    className="bg-background rounded-full px-3 py-1.5"
                  >
                    <Text className="text-caption font-semibold text-text-primary">
                      {t('progress.stats.streak', {
                        count: inventory.global.currentStreak,
                      })}
                    </Text>
                  </View>
                  {/* [F-012] Show vocabulary pill for language subjects only. */}
                  {hasLanguageSubject ? (
                    <Pressable
                      onPress={() =>
                        router.push('/(app)/progress/vocabulary' as never)
                      }
                      className="bg-background rounded-full px-3 py-1.5"
                      accessibilityRole="button"
                      accessibilityLabel={
                        inventory.global.vocabularyTotal > 0
                          ? t('progress.stats.viewVocabCount', {
                              count: inventory.global.vocabularyTotal,
                            })
                          : t('progress.stats.viewVocab')
                      }
                      testID="progress-vocab-stat"
                    >
                      <Text className="text-caption font-semibold text-primary">
                        {inventory.global.vocabularyTotal > 0
                          ? t('progress.stats.wordsLink', {
                              count: inventory.global.vocabularyTotal,
                            })
                          : t('progress.stats.vocabularyLink')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {inventory ? (
                <View className="flex-row flex-wrap gap-2 mt-3">
                  <WeeklyDeltaChip
                    metric="topicsMastered"
                    value={inventory.global.weeklyDeltaTopicsMastered}
                  />
                  <WeeklyDeltaChip
                    metric="vocabularyTotal"
                    value={inventory.global.weeklyDeltaVocabularyTotal}
                  />
                  <WeeklyDeltaChip
                    metric="topicsExplored"
                    value={inventory.global.weeklyDeltaTopicsExplored}
                  />
                </View>
              ) : null}
            </View>

            {selectedProfileId ? (
              <>
                <TrackedView
                  eventName="progress_report_viewed"
                  dwellMs={1000}
                  properties={{
                    profile_id_hash: targetProfileHash,
                    is_active_profile_owner: isViewingSelf,
                    report_type: 'weekly',
                  }}
                  testID="progress-weekly-report-tracker"
                >
                  <WeeklyReportCard
                    profileId={selectedProfileId}
                    title={t(
                      `progress.register.${isViewingSelf ? register : 'child'}.weekTitle`,
                    )}
                    register={isViewingSelf ? register : 'child'}
                    thisWeekMini={
                      isViewingSelf ? inventory?.thisWeekMini : undefined
                    }
                  />
                </TrackedView>
                <TrackedView
                  eventName="progress_report_viewed"
                  dwellMs={1000}
                  properties={{
                    profile_id_hash: targetProfileHash,
                    is_active_profile_owner: isViewingSelf,
                    report_type: 'monthly',
                  }}
                  testID="progress-monthly-report-tracker"
                >
                  <MonthlyReportCard
                    profileId={selectedProfileId}
                    title={t(
                      `progress.register.${isViewingSelf ? register : 'child'}.monthTitle`,
                    )}
                    register={isViewingSelf ? register : 'child'}
                  />
                </TrackedView>
              </>
            ) : null}

            {selectedProfileId && progressSurfaceState === 'ready' ? (
              <ReportsListCard
                profileId={selectedProfileId}
                interactive
                selfView={isViewingSelf}
              />
            ) : null}

            {inventory?.currentlyWorkingOn?.length ? (
              <CurrentlyWorkingOnCard
                items={inventory.currentlyWorkingOn}
                register={register}
                testID="progress-currently-working-on"
              />
            ) : null}

            <View className="mt-6">
              <GrowthChart
                title={t(`progress.register.${register}.growthTitle`)}
                subtitle={t(`progress.register.${register}.growthSubtitle`)}
                data={growthData}
                register={register}
                emptyMessage={
                  // [F-043] Distinguish brand-new users from users who have
                  // sessions but no mastery data yet (mastery takes repeat exposures).
                  // When totalSessions >= 3, hint that topic mastery unlocks the chart.
                  (inventory?.global.totalSessions ?? 0) >= 3
                    ? t('progress.growth.emptyFoundation')
                    : (inventory?.global.totalSessions ?? 0) > 0
                      ? t('progress.growth.emptyInProgress', {
                          count: inventory?.global.totalSessions ?? 0,
                        })
                      : t('progress.growth.emptyJustStarted')
                }
              />
            </View>

            {selectedProfileId ? (
              <RecentSessionsList profileId={selectedProfileId} />
            ) : null}

            {isViewingSelf ? (
              <>
                <View className="flex-row items-center justify-between mt-6 mb-2">
                  <Text className="text-h3 font-semibold text-text-primary">
                    {t('progress.milestones.recentTitle')}
                  </Text>
                  {milestonesQuery.data ? (
                    <Pressable
                      onPress={() =>
                        router.push('/(app)/progress/milestones' as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={t('progress.milestones.seeAll')}
                      testID="progress-milestones-see-all"
                    >
                      <Text className="text-body-sm text-primary font-medium">
                        {t('progress.milestones.seeAllLink')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                {milestonesQuery.isError && !milestonesQuery.data ? (
                  <ErrorFallback
                    variant="card"
                    message={classifyApiError(milestonesQuery.error).message}
                    primaryAction={{
                      label: t('common.tryAgain'),
                      onPress: () => void milestonesQuery.refetch(),
                      testID: 'progress-milestones-error-retry',
                    }}
                    testID="progress-milestones-error"
                  />
                ) : milestonesQuery.data && milestonesQuery.data.length > 0 ? (
                  milestonesQuery.data.map((milestone) => (
                    <View key={milestone.id} className="mt-3">
                      <MilestoneCard milestone={milestone} />
                    </View>
                  ))
                ) : (
                  <View
                    className="bg-surface rounded-card px-4 py-3"
                    testID="milestones-teaser"
                  >
                    <Text className="text-caption text-text-secondary text-center">
                      {getNextMilestoneLabel(
                        inventory?.global.totalSessions ?? 0,
                        t,
                      )}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={() => router.push('/(app)/progress/saved' as never)}
                  className="bg-surface rounded-card p-4 mt-6 flex-row items-center justify-between"
                  accessibilityRole="button"
                  accessibilityLabel={t('progress.saved.viewLabel')}
                  testID="progress-saved-link"
                >
                  <View className="flex-row items-center gap-3">
                    <Ionicons
                      name="bookmark"
                      size={20}
                      className="text-primary"
                    />
                    <Text className="text-body font-medium text-text-primary">
                      {t('progress.saved.title')}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    className="text-text-tertiary"
                  />
                </Pressable>
              </>
            ) : null}

            {isViewingSelf ? (
              <Pressable
                onPress={handleGlobalResume}
                className="bg-primary rounded-button px-4 py-3 mt-6 items-center"
                accessibilityRole="button"
                accessibilityLabel={t('progress.keepLearning')}
                testID="progress-keep-learning"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('progress.keepLearning')}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
