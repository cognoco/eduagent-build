import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  ChildSession,
  MonthlyReportSummary,
  ProgressSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import type { Translate } from '../../../i18n';
import { platformAlert } from '../../../lib/platform-alert';
import { classifyApiError } from '../../../lib/format-api-error';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorFallback } from '../../../components/common';
import {
  formatMinutes,
  formatRelativeDate,
} from '../../../lib/format-relative-date';
import { NudgeActionSheet } from '../../../components/nudge/NudgeActionSheet';
import {
  MetricCard,
  MilestoneCard,
  RecentSessionsList,
  ReportsList,
} from '../../../components/progress';
import { ProgressPillRow } from '../../../components/progress/ProgressPillRow';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import {
  useChildInventory,
  useChildProgressSummary,
  useLearningResumeTarget,
  useOverallProgress,
  useProgressInventory,
  useProgressMilestones,
  useProfileReports,
  useProfileSessions,
  useProfileWeeklyReports,
  useRefreshProgressSnapshot,
} from '../../../hooks/use-progress';
import { useSubjects } from '../../../hooks/use-subjects';
import { pushLearningResumeTarget } from '../../../lib/navigation';
import { copyRegisterFor, type CopyRegister } from '../../../lib/copy-register';
import { useLinkedChildren, useProfile } from '../../../lib/profile';
import { isProfileStale } from '../../../lib/progress';
import { bucketAccountAge, hashProfileId, track } from '../../../lib/analytics';

function heroCopy(
  input: {
    topicsMastered: number;
    vocabularyTotal: number;
    totalSessions: number;
  },
  register: CopyRegister,
  t: Translate,
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
  t: Translate,
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

function ProgressSummaryHeader({
  summary,
}: {
  summary: ProgressSummary;
}): React.ReactElement {
  const { t } = useTranslation();
  if (summary.summary == null) {
    return (
      <View
        testID="progress-summary-fallback"
        className="bg-coaching-card rounded-card p-5 mt-4"
      >
        <Text className="text-body text-text-secondary">
          {t('progress.guardian.summaryFallback')}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="progress-summary-header"
      className="bg-coaching-card rounded-card p-5 mt-4"
    >
      <Text className="text-body text-text-primary">{summary.summary}</Text>
      {summary.activityState === 'no_recent_activity' ? (
        <View testID="progress-summary-no-recent">
          <Text className="text-body-sm text-text-secondary mt-2">
            {summary.basedOnLastSessionAt
              ? t('progress.guardian.noRecentSessions', {
                  date: formatRelativeDate(summary.basedOnLastSessionAt),
                })
              : t('progress.guardian.noRecentSessionsFallback')}
          </Text>
        </View>
      ) : null}
      {summary.activityState === 'stale' ? (
        <Text className="text-body-sm text-text-secondary mt-2">
          {t('progress.guardian.staleSummary')}
        </Text>
      ) : null}
    </View>
  );
}

type LatestReport =
  | { kind: 'weekly'; report: WeeklyReportSummary }
  | { kind: 'monthly'; report: MonthlyReportSummary };

function formatReportDate(report: LatestReport): string {
  if (report.kind === 'monthly') {
    return new Date(
      `${report.report.reportMonth}-01T00:00:00Z`,
    ).toLocaleDateString(undefined, {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    });
  }

  const start = new Date(`${report.report.reportWeek}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${startLabel} - ${endLabel}`;
}

function getLatestReport(
  weeklyReports: WeeklyReportSummary[] | undefined,
  monthlyReports: MonthlyReportSummary[] | undefined,
): LatestReport | null {
  const weekly = weeklyReports?.[0];
  if (weekly) return { kind: 'weekly', report: weekly };
  const monthly = monthlyReports?.[0];
  return monthly ? { kind: 'monthly', report: monthly } : null;
}

function LatestReportCard({
  latestReport,
  isError,
  isLoading,
  onOpen,
  onRetry,
}: {
  latestReport: LatestReport | null;
  isError: boolean;
  isLoading: boolean;
  onOpen: () => void;
  onRetry: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const metrics =
    latestReport?.kind === 'weekly'
      ? latestReport.report.thisWeek
      : latestReport?.report.thisMonth;
  const practiceTotals = latestReport?.report.practiceSummary?.totals;

  return (
    <View className="mt-6" testID="progress-latest-report-section">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-h3 font-semibold text-text-primary">
          {t('progress.latestReport.title')}
        </Text>
        {latestReport ? (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t('progress.latestReport.open')}
            testID="progress-latest-report-open"
          >
            <Text className="text-body-sm text-primary font-semibold">
              {t('progress.latestReport.open')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="bg-surface rounded-card p-4">
        {isLoading && !latestReport ? (
          <>
            <View className="bg-border rounded h-5 w-1/2 mb-3" />
            <View className="bg-border rounded h-4 w-full mb-2" />
            <View className="bg-border rounded h-4 w-2/3" />
          </>
        ) : isError && !latestReport ? (
          <View testID="progress-latest-report-error">
            <Text className="text-body text-text-secondary mb-3">
              {t('progress.latestReport.error')}
            </Text>
            <Pressable
              onPress={onRetry}
              className="bg-background rounded-button px-4 py-3 items-center self-start"
              accessibilityRole="button"
              accessibilityLabel={t('common.tryAgain')}
              testID="progress-latest-report-retry"
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('common.tryAgain')}
              </Text>
            </Pressable>
          </View>
        ) : latestReport && metrics ? (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t('progress.latestReport.openWithDate', {
              date: formatReportDate(latestReport),
            })}
            testID="progress-latest-report-card"
          >
            <Text className="text-body-sm text-text-secondary">
              {formatReportDate(latestReport)}
            </Text>
            <Text className="text-h2 font-bold text-text-primary mt-2">
              {latestReport.report.headlineStat.value}{' '}
              {latestReport.report.headlineStat.label}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {latestReport.report.headlineStat.comparison}
            </Text>
            <View className="flex-row gap-3 mt-4">
              <MetricCard
                label={t('progress.latestReport.sessions')}
                value={String(metrics.totalSessions)}
              />
              <MetricCard
                label={t('progress.latestReport.time')}
                value={formatMinutes(metrics.totalActiveMinutes)}
              />
            </View>
            <View className="flex-row gap-3 mt-3">
              <MetricCard
                label={t('progress.latestReport.topics')}
                value={String(metrics.topicsMastered)}
              />
              <MetricCard
                label={t('progress.latestReport.words')}
                value={String(metrics.vocabularyTotal)}
              />
            </View>
            {practiceTotals &&
            (practiceTotals.activitiesCompleted > 0 ||
              practiceTotals.pointsEarned > 0) ? (
              <View className="flex-row flex-wrap gap-2 mt-4">
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    {t('progress.latestReport.practiceLessons', {
                      count: practiceTotals.activitiesCompleted,
                    })}
                  </Text>
                </View>
                <View className="bg-background rounded-full px-3 py-1.5">
                  <Text className="text-caption font-semibold text-text-primary">
                    {t('progress.latestReport.practicePoints', {
                      count: practiceTotals.pointsEarned,
                    })}
                  </Text>
                </View>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <Text
            className="text-body text-text-secondary"
            testID="progress-latest-report-empty"
          >
            {t('progress.latestReport.empty')}
          </Text>
        )}
      </View>
    </View>
  );
}

function sessionFocusTitle(session: ChildSession): string {
  return (
    session.homeworkSummary?.displayTitle ??
    session.topicTitle ??
    session.subjectName ??
    session.displayTitle ??
    'Learning session'
  );
}

function RecentFocusCard({
  sessions,
  fallbackItems,
  isLoading,
  isError,
  onRetry,
  onShowAll,
}: {
  sessions: ChildSession[] | undefined;
  fallbackItems: string[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onShowAll: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const focusSessions = sessions?.slice(0, 2) ?? [];
  const fallbackFocus =
    focusSessions.length === 0 ? fallbackItems.slice(0, 2) : [];

  return (
    <View className="mt-6" testID="progress-recent-focus-card">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-h3 font-semibold text-text-primary">
          {t('progress.recentFocus.title')}
        </Text>
        <Pressable
          onPress={onShowAll}
          accessibilityRole="button"
          accessibilityLabel={t('progress.recentFocus.showAll')}
          testID="progress-show-all-sessions"
        >
          <Text className="text-body-sm text-primary font-semibold">
            {t('progress.recentFocus.showAll')}
          </Text>
        </Pressable>
      </View>

      <View className="bg-surface rounded-card p-4">
        {isLoading ? (
          <>
            <View className="bg-border rounded h-5 w-2/3 mb-3" />
            <View className="bg-border rounded h-4 w-full mb-2" />
            <View className="bg-border rounded h-4 w-1/2" />
          </>
        ) : isError ? (
          <View testID="progress-recent-focus-error">
            <Text className="text-body text-text-secondary mb-3">
              {t('progress.recentFocus.error')}
            </Text>
            <Pressable
              onPress={onRetry}
              className="bg-background rounded-button px-4 py-3 items-center self-start"
              accessibilityRole="button"
              accessibilityLabel={t('common.tryAgain')}
              testID="progress-recent-focus-retry"
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('common.tryAgain')}
              </Text>
            </Pressable>
          </View>
        ) : focusSessions.length > 0 ? (
          focusSessions.map((session, index) => (
            <View
              key={session.sessionId}
              className={index === 0 ? '' : 'border-t border-border mt-3 pt-3'}
            >
              <Text className="text-body font-semibold text-text-primary">
                {sessionFocusTitle(session)}
              </Text>
              <Text
                className="text-body-sm text-text-secondary mt-1"
                numberOfLines={2}
              >
                {session.displaySummary ??
                  session.highlight ??
                  t('progress.recentFocus.sessionFallback', {
                    date: formatRelativeDate(session.startedAt),
                  })}
              </Text>
            </View>
          ))
        ) : fallbackFocus.length > 0 ? (
          fallbackFocus.map((item, index) => (
            <View key={item} className={index === 0 ? '' : 'mt-3'}>
              <Text className="text-body font-semibold text-text-primary">
                {item}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-body text-text-secondary">
            {t('progress.recentFocus.empty')}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function ProgressScreen(): React.ReactElement {
  const { t } = useTranslation();
  const role = useActiveProfileRole();
  const register = copyRegisterFor(role);
  const router = useRouter();
  const { profileId: rawRequestedProfileId } = useLocalSearchParams<{
    profileId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const linkedChildren = useLinkedChildren();
  const hasLinked = linkedChildren.length > 0;
  const requestedProfileId = Array.isArray(rawRequestedProfileId)
    ? rawRequestedProfileId[0]
    : rawRequestedProfileId;

  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => {
    const knownRequestedProfileId =
      requestedProfileId &&
      (requestedProfileId === activeProfile?.id ||
        linkedChildren.some((child) => child.id === requestedProfileId));
    if (knownRequestedProfileId) return requestedProfileId;
    return activeProfile?.id ?? '';
  });
  const [showProgressNudge, setShowProgressNudge] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);

  useEffect(() => {
    if (!requestedProfileId) return;
    const knownTarget =
      requestedProfileId === activeProfile?.id ||
      linkedChildren.some((child) => child.id === requestedProfileId);
    if (knownTarget) {
      setSelectedProfileId(requestedProfileId);
    }
  }, [requestedProfileId, activeProfile?.id, linkedChildren]);

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

  const ownInventoryQuery = useProgressInventory();
  const childInventoryQuery = useChildInventory(
    isViewingSelf ? undefined : selectedProfileId,
    { enabled: !isViewingSelf },
  );
  const inventoryQuery = isViewingSelf
    ? ownInventoryQuery
    : childInventoryQuery;

  const childSummaryQuery = useChildProgressSummary(
    isViewingSelf ? undefined : selectedProfileId,
    { enabled: !isViewingSelf },
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
  const milestonesQuery = useProgressMilestones(5);
  const subjectsQuery = useSubjects();
  const {
    mutateAsync: refreshProgressSnapshot,
    isPending: isRefreshingSnapshot,
  } = useRefreshProgressSnapshot();
  const hasFocusedOnceRef = useRef(false);

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

  const refetchInventory = inventoryQuery.refetch;
  const refetchMilestones = milestonesQuery.refetch;
  const refetchMonthlyReports = monthlyReportsQuery.refetch;
  const refetchWeeklyReports = weeklyReportsQuery.refetch;
  const refetchChildSummary = childSummaryQuery.refetch;

  const handleRefresh = useCallback(
    async (options?: { alertOnError?: boolean }) => {
      if (isViewingSelf) {
        try {
          await refreshProgressSnapshot();
        } catch (err) {
          if (options?.alertOnError !== false) {
            const message =
              err instanceof Error ? err.message : t('progress.refreshFailed');
            platformAlert(t('progress.refreshFailedTitle'), message);
          }
        }
      }

      await Promise.all([
        refetchInventory(),
        refetchMonthlyReports(),
        refetchWeeklyReports(),
        ...(!isViewingSelf ? [refetchChildSummary()] : []),
        ...(isViewingSelf ? [refetchMilestones()] : []),
      ]);
    },
    [
      isViewingSelf,
      refetchInventory,
      refetchMilestones,
      refetchMonthlyReports,
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

  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [isLoading]);
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
  // TODO: D-RP-18 Phase 2 — add 'ineligible' once API provides the discriminator.
  // Until then, no-reports-yet and truly-ineligible both collapse to 'awaiting'.
  const progressSurfaceState: 'empty' | 'awaiting' | 'ready' =
    isEmpty || (isViewingSelf && isStale)
      ? 'empty'
      : hasAnyReports
        ? 'ready'
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
  const progressPageTitle = isViewingSelf
    ? t('progress.pageTitleMine')
    : t('progress.pageTitleProfile', {
        name: selectedChildName ?? t('progress.pageTitleFallbackName'),
      });
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

    router.push(
      latestReport.kind === 'weekly'
        ? ({
            pathname: '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
            params: {
              profileId: selectedProfileId,
              weeklyReportId: latestReport.report.id,
            },
          } as Href)
        : ({
            pathname: '/(app)/child/[profileId]/report/[reportId]',
            params: {
              profileId: selectedProfileId,
              reportId: latestReport.report.id,
            },
          } as Href),
    );
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
      router.push({
        pathname: '/(app)/child/[profileId]/report/[reportId]',
        params: { profileId: selectedProfileId, reportId },
      } as Href);
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
      router.push({
        pathname: '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
        params: { profileId: selectedProfileId, weeklyReportId },
      } as Href);
    },
    [isViewingSelf, router, selectedProfileId],
  );

  const handleEmptyProgressAction = () => {
    if (activeProfile) {
      track('progress_empty_state_cta_tapped', {
        profile_id_hash: hashProfileId(activeProfile.id),
        account_age_bucket: bucketAccountAge(activeProfile.createdAt),
      });
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

        {hasLinked ? (
          <ProgressPillRow
            childrenProfiles={linkedChildren}
            selectedProfileId={selectedProfileId}
            ownProfileId={activeProfile?.id}
            onSelect={setSelectedProfileId}
          />
        ) : null}

        {isLoading ? (
          loadTimedOut ? (
            <ErrorFallback
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
              testID="progress-loading-timeout"
            />
          ) : (
            <LoadingBlock />
          )
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
              {firstActiveSubject
                ? t('progress.empty.withSubjectTitle', {
                    subject: firstActiveSubject.name,
                  })
                : t('progress.empty.title')}
            </Text>
            <Text className="text-body text-text-secondary mt-2">
              {firstActiveSubject
                ? t('progress.empty.withSubjectSubtitle', {
                    subject: firstActiveSubject.name,
                  })
                : t('progress.empty.subtitle')}
            </Text>
            <Pressable
              onPress={handleEmptyProgressAction}
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
                  {practiceActivityCount > 0 ? (
                    <View className="bg-background rounded-full px-3 py-1.5">
                      <Text className="text-caption font-semibold text-text-primary">
                        {t('progress.stats.practiceLessons', {
                          count: practiceActivityCount,
                        })}
                      </Text>
                    </View>
                  ) : null}
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
                        router.push('/(app)/progress/vocabulary' as Href)
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
            </View>

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
                    onPress={() =>
                      router.push(
                        isViewingSelf
                          ? ('/(app)/progress/reports' as Href)
                          : (`/(app)/child/${selectedProfileId}/reports` as Href),
                      )
                    }
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

            {isViewingSelf ? (
              <>
                <View className="flex-row items-center justify-between mt-6 mb-2">
                  <Text className="text-h3 font-semibold text-text-primary">
                    {t('progress.milestones.recentTitle')}
                  </Text>
                  {milestonesQuery.data ? (
                    <Pressable
                      onPress={() =>
                        router.push('/(app)/progress/milestones' as Href)
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
