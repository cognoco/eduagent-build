import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProgressMetrics } from '../../../hooks/use-progress';
import { heroCopy } from './_view-models/progress-hero-copy';
import { getLatestReport } from './_view-models/progress-report-helpers';
import { ProgressLoadingBlock } from './_components/ProgressLoadingBlock';
import { ProgressSummaryHeader } from './_components/ProgressSummaryHeader';
import { LatestReportCard } from './_components/LatestReportCard';
import { RecentFocusCard } from './_components/RecentFocusCard';
import { ProgressStatsChips } from './_components/ProgressStatsChips';
import { platformAlert } from '../../../lib/platform-alert';
import {
  classifyApiError,
  formatApiError,
} from '../../../lib/format-api-error';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback, TimeoutLoader } from '../../../components/common';
import { NudgeActionSheet } from '../../../components/nudge/NudgeActionSheet';
import {
  RecentSessionsList,
  ReportsList,
  SubjectProgressRow,
} from '../../../components/progress';
import { ProgressPillRow } from '../../../components/progress/ProgressPillRow';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import {
  useChildInventory,
  useChildProgressSummary,
  useLearningResumeTarget,
  useOverallProgress,
  useProgressInventory,
  useProfileReports,
  useProfileSessions,
  useProfileWeeklyReports,
  useRefreshProgressSnapshot,
} from '../../../hooks/use-progress';
import { useSubjects } from '../../../hooks/use-subjects';
import {
  pushChildReport,
  pushChildReports,
  pushChildWeeklyReport,
  pushLearningResumeTarget,
} from '../../../lib/navigation';
import { useLinkedChildren, useProfile } from '../../../lib/profile';
import { bucketAccountAge, hashProfileId, track } from '../../../lib/analytics';
import { useApiClient } from '../../../lib/api-client';
import { getSubjectTintMap } from '../../../lib/subject-tints';
import { useAppContext } from '../../../lib/app-context';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { useTheme } from '../../../lib/theme';

export default function ProgressScreen(): React.ReactElement {
  const { t } = useTranslation();
  const role = useActiveProfileRole();
  const register =
    role === 'child' || role === 'impersonated-child' ? 'child' : 'owner';
  const router = useRouter();
  const client = useApiClient();
  const { profileId: rawRequestedProfileId } = useLocalSearchParams<{
    profileId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const linkedChildren = useLinkedChildren();
  const navigationContract = useNavigationContract();
  const { mode: legacyMode } = useAppContext();
  const mode = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.effectiveAppContext
    : legacyMode;
  const isFamilyProgress = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.gates.progressScope === 'children'
    : mode === 'family';
  const canViewLinkedChildProgress = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.gates.showProgressProfilePicker
    : role === 'owner' && mode !== 'study';
  const hasLinked = linkedChildren.length > 0;
  const { colorScheme } = useTheme();
  const requestedProfileId = Array.isArray(rawRequestedProfileId)
    ? rawRequestedProfileId[0]
    : rawRequestedProfileId;

  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => {
    if (isFamilyProgress) return linkedChildren[0]?.id ?? '';
    const knownRequestedProfileId =
      requestedProfileId && requestedProfileId === activeProfile?.id;
    if (knownRequestedProfileId) return requestedProfileId;
    return activeProfile?.id ?? '';
  });
  const [showProgressNudge, setShowProgressNudge] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [progressMetrics, setProgressMetrics] =
    useState<ProgressMetrics | null>(null);

  useEffect(() => {
    if (!requestedProfileId) return;
    const knownTarget = isFamilyProgress
      ? linkedChildren.some((child) => child.id === requestedProfileId)
      : requestedProfileId === activeProfile?.id ||
        (canViewLinkedChildProgress &&
          linkedChildren.some((child) => child.id === requestedProfileId));
    if (knownTarget) {
      setSelectedProfileId(requestedProfileId);
    }
  }, [
    requestedProfileId,
    activeProfile?.id,
    canViewLinkedChildProgress,
    linkedChildren,
    isFamilyProgress,
  ]);

  useEffect(() => {
    const selectedLinkedChildStillAllowed =
      canViewLinkedChildProgress &&
      linkedChildren.some((child) => child.id === selectedProfileId);

    if (
      !isFamilyProgress &&
      activeProfile?.id &&
      selectedProfileId !== activeProfile.id &&
      !selectedLinkedChildStillAllowed
    ) {
      setSelectedProfileId(activeProfile.id);
    }
    if (
      isFamilyProgress &&
      selectedProfileId === activeProfile?.id &&
      linkedChildren[0]
    ) {
      setSelectedProfileId(linkedChildren[0].id);
    }
  }, [
    activeProfile?.id,
    canViewLinkedChildProgress,
    isFamilyProgress,
    linkedChildren,
    selectedProfileId,
  ]);

  // Re-seed when activeProfile loads after mount.
  useEffect(() => {
    if (requestedProfileId) return;
    if (!selectedProfileId && activeProfile?.id) {
      setSelectedProfileId(activeProfile.id);
    }
  }, [selectedProfileId, activeProfile?.id, requestedProfileId]);

  const isViewingSelf =
    selectedProfileId === activeProfile?.id ||
    (!hasLinked && !selectedProfileId);
  const selectedLinkedChildProfile = linkedChildren.some(
    (child) => child.id === selectedProfileId,
  );
  const isViewingLinkedChildProgress =
    !isViewingSelf && canViewLinkedChildProgress && selectedLinkedChildProfile;

  const ownInventoryQuery = useProgressInventory();
  const childInventoryQuery = useChildInventory(
    isViewingLinkedChildProgress ? selectedProfileId : undefined,
    { enabled: isViewingLinkedChildProgress },
  );
  const inventoryQuery = isViewingSelf
    ? ownInventoryQuery
    : childInventoryQuery;

  const childSummaryQuery = useChildProgressSummary(
    isViewingLinkedChildProgress ? selectedProfileId : undefined,
    { enabled: isViewingLinkedChildProgress },
  );
  const overallProgressQuery = useOverallProgress();

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
  const subjectsQuery = useSubjects();
  const {
    mutateAsync: refreshProgressSnapshot,
    isPending: isRefreshingSnapshot,
  } = useRefreshProgressSnapshot();
  const hasFocusedOnceRef = useRef(false);

  const inventory = inventoryQuery.data;
  const subjectTintsById = useMemo(
    () =>
      getSubjectTintMap(
        inventory?.subjects.map((subject) => subject.subjectId) ?? [],
        colorScheme,
      ),
    [colorScheme, inventory?.subjects],
  );
  const hero = heroCopy(
    {
      topicsMastered: inventory?.global.topicsMastered ?? 0,
      vocabularyTotal: inventory?.global.vocabularyTotal ?? 0,
      totalSessions: inventory?.global.totalSessions ?? 0,
    },
    isViewingSelf ? register : 'child',
    t,
  );

  const refetchInventory = inventoryQuery.refetch;
  const refetchMonthlyReports = monthlyReportsQuery.refetch;
  const refetchProfileSessions = profileSessionsQuery.refetch;
  const refetchWeeklyReports = weeklyReportsQuery.refetch;
  const refetchChildSummary = childSummaryQuery.refetch;

  const handleRefresh = useCallback(
    async (options?: { alertOnError?: boolean }) => {
      if (isViewingSelf) {
        try {
          const result = await refreshProgressSnapshot();
          if (result?.metrics) {
            setProgressMetrics(result.metrics);
          }
        } catch (err) {
          if (options?.alertOnError !== false) {
            platformAlert(
              t('progress.refreshFailedTitle'),
              formatApiError(err),
            );
          }
        }
      }

      await Promise.all([
        refetchInventory(),
        refetchMonthlyReports(),
        refetchProfileSessions(),
        refetchWeeklyReports(),
        ...(!isViewingSelf ? [refetchChildSummary()] : []),
      ]);
    },
    [
      isViewingSelf,
      refetchInventory,
      refetchMonthlyReports,
      refetchProfileSessions,
      refetchWeeklyReports,
      refetchChildSummary,
      refreshProgressSnapshot,
      t,
    ],
  );
  const handleRefreshRef = useRef(handleRefresh);

  useEffect(() => {
    handleRefreshRef.current = handleRefresh;
  }, [handleRefresh]);

  // [S5-H2] Load progress metrics on mount so the recall-queue chip is visible
  // without requiring a pull-to-refresh first. Best-effort: silent on failure
  // (pull-to-refresh will retry with a user-visible alert).
  const hasMountedMetricsRef = useRef(false);
  useEffect(() => {
    if (hasMountedMetricsRef.current || !isViewingSelf) return;
    hasMountedMetricsRef.current = true;
    void (async () => {
      try {
        const result = await refreshProgressSnapshot();
        if (result?.metrics) {
          setProgressMetrics(result.metrics);
        }
      } catch {
        // Silent — mount-time metrics load is best-effort only.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewingSelf]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      void handleRefreshRef.current({ alertOnError: false });
    }, []),
  );

  const handleGlobalResume = useCallback(() => {
    if (resumeTargetQuery.data) {
      pushLearningResumeTarget(router, resumeTargetQuery.data);
      return;
    }
    router.push('/(app)/home' as Href);
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
  const latestReport = useMemo(
    () => getLatestReport(weeklyReportsQuery.data, monthlyReportsQuery.data),
    [monthlyReportsQuery.data, weeklyReportsQuery.data],
  );
  const isParentProxyView = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.isParentProxy
    : role === 'impersonated-child';
  // TODO: D-RP-18 Phase 2 — add 'ineligible' once API provides the discriminator.
  // Until then, no-reports-yet and truly-ineligible both collapse to 'awaiting'.
  // Report evidence must win over the empty/stale fallback. Otherwise a
  // report can flash in from the reports query and then disappear as soon as
  // the inventory/session queries resolve to an empty or stale shell.
  const progressSurfaceState: 'empty' | 'awaiting' | 'ready' = hasAnyReports
    ? 'ready'
    : isEmpty
      ? 'empty'
      : 'awaiting';

  const hasLanguageSubject = inventory?.subjects?.some(
    (s) => s.pedagogyMode === 'four_strands',
  );
  const firstActiveSubject = subjectsQuery.data?.find(
    (subject) => subject.status === 'active',
  );
  const selectedChild = linkedChildren.find(
    (child) => child.id === selectedProfileId,
  );
  const selectedChildName = selectedChild?.displayName;
  const progressPageTitle = isParentProxyView
    ? t('progress.pageTitleProfile', {
        name: activeProfile?.displayName ?? t('progress.pageTitleFallbackName'),
      })
    : isViewingSelf
      ? t('progress.pageTitleMine')
      : t('progress.pageTitleProfile', {
          name: selectedChildName ?? t('progress.pageTitleFallbackName'),
        });
  // [B-600] Family-context users (proxy view or family progress tab) must not
  // be offered the adult Study Library — route them to child curriculum instead.
  const emptyProgressActionLabel =
    isParentProxyView || isViewingLinkedChildProgress
      ? t('progress.guardian.goToChildCurriculum')
      : t('progress.startLearning');
  const practiceActivityCount = isViewingSelf
    ? (overallProgressQuery.data?.practiceActivityCount ?? 0)
    : 0;

  useEffect(() => {
    setShowAllSessions(false);
  }, [selectedProfileId]);

  const handleOpenLatestReport = useCallback(() => {
    if (!latestReport || !selectedProfileId) return;

    if (isViewingSelf) {
      router.push(
        latestReport.kind === 'weekly'
          ? ({
              pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
              params: { weeklyReportId: latestReport.report.id },
            } as Href)
          : ({
              pathname: '/(app)/progress/reports/[reportId]',
              params: { reportId: latestReport.report.id },
            } as Href),
      );
      return;
    }

    // [BUG-524] Cross-tab push must seed the parent chain. See
    // pushChildReport / pushChildWeeklyReport in lib/navigation.ts.
    if (latestReport.kind === 'weekly') {
      pushChildWeeklyReport(router, selectedProfileId, latestReport.report.id);
    } else {
      pushChildReport(router, selectedProfileId, latestReport.report.id);
    }
  }, [isViewingSelf, latestReport, router, selectedProfileId]);

  const handleOpenMonthlyReport = useCallback(
    (reportId: string) => {
      if (isViewingSelf) {
        router.push({
          pathname: '/(app)/progress/reports/[reportId]',
          params: { reportId },
        } as Href);
        return;
      }
      // [BUG-524] Cross-tab push must seed parent chain.
      pushChildReport(router, selectedProfileId, reportId);
    },
    [isViewingSelf, router, selectedProfileId],
  );

  const handleOpenWeeklyReport = useCallback(
    (weeklyReportId: string) => {
      if (isViewingSelf) {
        router.push({
          pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
          params: { weeklyReportId },
        } as Href);
        return;
      }
      // [BUG-524] Cross-tab push must seed parent chain.
      pushChildWeeklyReport(router, selectedProfileId, weeklyReportId);
    },
    [isViewingSelf, router, selectedProfileId],
  );

  const handleEmptyProgressAction = () => {
    if (activeProfile) {
      const profileId = activeProfile.id;
      const accountAgeBucket = bucketAccountAge(activeProfile.createdAt);
      void hashProfileId(profileId, client).then((profileIdHash) => {
        track('progress_empty_state_cta_tapped', {
          profile_id_hash: profileIdHash,
          account_age_bucket: accountAgeBucket,
        });
      });
    }

    // [B-600] Family-context users must never be routed to the adult Study
    // Library or the adult Shelf. Route them to the child's curriculum instead.
    if (isParentProxyView || isViewingLinkedChildProgress) {
      if (selectedProfileId) {
        router.push({
          pathname: '/(app)/child/[profileId]/curriculum',
          params: { profileId: selectedProfileId },
        } as Href);
      } else {
        router.push('/(app)/home' as Href);
      }
      return;
    }

    if (firstActiveSubject) {
      router.push({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: firstActiveSubject.id },
      } as Href);
      return;
    }

    router.push('/(app)/library' as Href);
  };

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
            refreshing={isRefreshingSnapshot || inventoryQuery.isRefetching}
            onRefresh={() => void handleRefresh()}
          />
        }
      >
        <Text className="text-h1 font-bold text-text-primary mt-4">
          {progressPageTitle}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1 mb-4">
          {t('progress.pageSubtitle')}
        </Text>

        {hasLinked &&
        (FEATURE_FLAGS.MODE_NAV_V1_ENABLED
          ? navigationContract.gates.showProgressProfilePicker
          : canViewLinkedChildProgress) ? (
          <ProgressPillRow
            childrenProfiles={linkedChildren}
            selectedProfileId={selectedProfileId}
            ownProfileId={isFamilyProgress ? undefined : activeProfile?.id}
            onSelect={setSelectedProfileId}
          />
        ) : null}

        {isLoading ? (
          <TimeoutLoader
            isLoading
            variant="card"
            title={t('progress.error.loadTitle')}
            message={t('progress.error.loadMessageNetwork')}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void inventoryQuery.refetch(),
              testID: 'progress-loading-retry',
            }}
            secondaryAction={{
              label: t('progress.error.goHome'),
              onPress: () => router.push('/(app)/home' as Href),
              testID: 'progress-loading-home',
            }}
            fallbackTestID="progress-loading-timeout"
            loadingFallback={<ProgressLoadingBlock />}
          />
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
              onPress: () => router.push('/(app)/home' as Href),
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
              onPress={handleEmptyProgressAction}
              className="bg-primary rounded-button px-4 py-3 mt-4 items-center"
              accessibilityRole="button"
              accessibilityLabel={emptyProgressActionLabel}
              testID="progress-start-learning"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {emptyProgressActionLabel}
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
            </View>

            <ProgressStatsChips
              inventory={inventory ?? undefined}
              progressMetrics={progressMetrics}
              practiceActivityCount={practiceActivityCount}
              hasLanguageSubject={hasLanguageSubject ?? false}
              isViewingSelf={isViewingSelf}
              onPressVocabulary={() =>
                router.push('/(app)/progress/vocabulary' as Href)
              }
            />

            <LatestReportCard
              latestReport={latestReport}
              isLoading={
                weeklyReportsQuery.isLoading || monthlyReportsQuery.isLoading
              }
              isError={
                weeklyReportsQuery.isError || monthlyReportsQuery.isError
              }
              onOpen={handleOpenLatestReport}
              onRetry={() => {
                void Promise.all([
                  weeklyReportsQuery.refetch(),
                  monthlyReportsQuery.refetch(),
                ]);
              }}
            />

            {selectedProfileId && hasAnyReports ? (
              <View
                className="bg-surface rounded-card p-4 mt-6"
                testID="reports-list-card"
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-body font-semibold text-text-primary">
                    {t('progress.previousReports.title')}
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (isViewingSelf) {
                        router.push('/(app)/progress/reports' as Href);
                      } else if (selectedProfileId) {
                        // [WI-1067] Use the navigation helper to push the full
                        // ancestor chain (child index first, then reports) so
                        // router.back() from the reports screen returns correctly.
                        pushChildReports(router, selectedProfileId);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('progress.previousReports.viewAll')}
                    testID="progress-reports-link"
                  >
                    <Text className="text-body-sm text-primary font-semibold">
                      {t('progress.previousReports.viewAll')}
                    </Text>
                  </Pressable>
                </View>
                <ReportsList
                  monthlyReports={monthlyReportsQuery.data ?? []}
                  weeklyReports={weeklyReportsQuery.data ?? []}
                  limit={2}
                  onPressMonthly={handleOpenMonthlyReport}
                  onPressWeekly={handleOpenWeeklyReport}
                />
              </View>
            ) : null}

            {selectedProfileId && !hasAnyReports ? (
              <Pressable
                testID="progress-view-all-reports"
                onPress={() => {
                  if (isViewingSelf) {
                    router.push('/(app)/progress/reports' as Href);
                  } else {
                    // [WI-1067] Push ancestor chain so router.back() returns correctly.
                    pushChildReports(router, selectedProfileId);
                  }
                }}
                className="bg-surface rounded-button px-4 py-3 mt-4 items-center min-h-[48px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('progress.guardian.viewAllReports')}
              >
                <Text className="text-body font-semibold text-primary">
                  {t('progress.guardian.viewAllReports')}
                </Text>
              </Pressable>
            ) : null}

            {!isViewingSelf ? (
              <>
                {childSummaryQuery.data ? (
                  <ProgressSummaryHeader summary={childSummaryQuery.data} />
                ) : null}
                {childSummaryQuery.data?.nudgeRecommended &&
                selectedChildName ? (
                  <Pressable
                    testID="progress-nudge-cta"
                    onPress={() => setShowProgressNudge(true)}
                    className="bg-primary rounded-button px-4 py-3 mt-3 items-center min-h-[48px] justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={t('progress.guardian.nudgeA11y', {
                      name: selectedChildName,
                    })}
                  >
                    <Text className="text-body font-semibold text-text-inverse">
                      {t('progress.guardian.nudgeCta', {
                        name: selectedChildName,
                      })}
                    </Text>
                  </Pressable>
                ) : null}
                {inventory?.subjects?.length ? (
                  <View testID="progress-subject-breakdown" className="mt-5">
                    <Text className="text-caption font-bold text-text-secondary mb-2">
                      {t('progress.guardian.subjectsTitle')}
                    </Text>
                    {inventory.subjects.map((subject) => (
                      <View key={subject.subjectId} className="mt-3">
                        <SubjectProgressRow
                          subject={subject}
                          tint={subjectTintsById.get(subject.subjectId)}
                          testID={`progress-subject-${subject.subjectId}`}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}

            <RecentFocusCard
              sessions={profileSessionsQuery.data}
              fallbackItems={inventory?.currentlyWorkingOn ?? []}
              isLoading={profileSessionsQuery.isLoading}
              isError={profileSessionsQuery.isError}
              onRetry={() => void profileSessionsQuery.refetch()}
              onShowAll={() => setShowAllSessions(true)}
            />

            {selectedProfileId && showAllSessions ? (
              <RecentSessionsList
                profileId={selectedProfileId}
                sessionsQuery={profileSessionsQuery}
              />
            ) : null}

            {isViewingSelf ? (
              <Pressable
                onPress={() => router.push('/(app)/progress/saved' as Href)}
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
      {showProgressNudge && selectedProfileId && selectedChildName ? (
        <NudgeActionSheet
          childName={selectedChildName}
          childProfileId={selectedProfileId}
          onClose={() => setShowProgressNudge(false)}
        />
      ) : null}
    </View>
  );
}
