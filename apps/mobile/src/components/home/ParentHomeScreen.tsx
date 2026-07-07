import { useCallback, memo, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { isAdultOwner } from '@eduagent/schemas';
import type {
  ChildCapNotification,
  DashboardChild,
  DashboardData,
  Profile,
} from '@eduagent/schemas';
import { isInGracePeriod } from '../../lib/consent-grace';
import { formatMediumDateTime } from '../../lib/format-datetime';
import type { Translate } from '../../i18n';

import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import {
  useChildCapNotifications,
  useDismissChildCapNotification,
} from '../../hooks/use-child-cap-notifications';
import { useChildMemory, useDashboard } from '../../hooks/use-dashboard';
import { useChildProgressSummary } from '../../hooks/use-progress';
import {
  useFamilySubscription,
  useSubscription,
} from '../../hooks/use-subscription';
import { getGreeting } from '../../lib/greeting';
import { useLinkedChildren } from '../../lib/profile';
import { withOpacity } from '../../lib/color-opacity';
import { useTheme, useThemeColors } from '../../lib/theme';
import { getSubjectTintMap } from '../../lib/subject-tints';
import { type SubjectTint } from '../../lib/design-tokens';
import { MentomateLogo } from '../MentomateLogo';
import {
  WithdrawalCountdownBanner,
  type ChildInGracePeriod,
} from '../family/WithdrawalCountdownBanner';
import { NudgeActionSheet } from '../nudge/NudgeActionSheet';
import { ParentTransitionNotice } from './ParentTransitionNotice';
import { ConnectSection } from './ConnectSection';
import { LearnTogetherSheet } from '../family/LearnTogetherSheet';
import {
  childProfileHref,
  pushChildReports as pushChildReportsNav,
} from '../../lib/navigation';
import { useRecaps } from '../../hooks/use-recaps';
import type { RecapListItem } from '@eduagent/schemas';
import {
  ConversationStarterCard,
  firstNameOf,
  type TonightPrompt,
} from './parent-card-prompts';
import {
  resolveHouseholdPulse,
  resolveParentCardCopy,
} from './parent-card-copy';
import { MentorSlot, resolveMentorSlotInsight } from './MentorSlot';

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

interface ParentHomeScreenProps {
  activeProfile: Profile | null;
  now?: Date;
}

function findDashboardChild(
  dashboard: DashboardData | undefined,
  childId: string,
): DashboardChild | undefined {
  return dashboard?.children.find((entry) => entry.profileId === childId);
}

// [#11] Delegates to the Hermes-safe formatter so a missing-ICU throw cannot
// crash the child-cap banner subtree. See lib/format-datetime.ts.
function formatChildCapResetAt(resetsAt: string): string {
  return formatMediumDateTime(resetsAt) || resetsAt;
}

function SingleChildMentorSlot({
  child,
  t,
}: {
  child: DashboardChild;
  t: Translate;
}): React.ReactElement | null {
  const memory = useChildMemory(child.profileId);
  const progressSummary = useChildProgressSummary(child.profileId);
  const insight = useMemo(
    () =>
      resolveMentorSlotInsight(
        memory.data ?? null,
        progressSummary.data ?? null,
      ),
    [memory.data, progressSummary.data],
  );

  return <MentorSlot child={child} insight={insight} t={t} />;
}

function ChildCapNotificationBanner({
  notification,
  onDismiss,
  isDismissing,
  t,
}: {
  notification: ChildCapNotification;
  onDismiss: (notificationId: string) => void;
  isDismissing: boolean;
  t: Translate;
}): React.ReactElement {
  const colors = useThemeColors();
  const messageKey =
    notification.kind === 'daily_exceeded'
      ? 'quota.parent.childCapHit.dailyMessage'
      : 'quota.parent.childCapHit.monthlyMessage';
  const resetAt = formatChildCapResetAt(notification.resetsAt);

  return (
    <View
      className="bg-surface rounded-card px-4 py-3"
      style={{
        borderColor: colors.warning + '33',
        borderWidth: 1,
      }}
      testID={`parent-home-child-cap-notification-${notification.id}`}
    >
      <View className="flex-row items-start">
        <View
          className="w-9 h-9 rounded-full bg-warning-soft items-center justify-center me-3"
          accessibilityElementsHidden
        >
          <Ionicons
            name="alert-circle-outline"
            size={20}
            color={colors.warning}
          />
        </View>
        <View className="flex-1">
          <Text className="text-body-sm font-semibold text-text-primary">
            {t('quota.parent.childCapHit.title', {
              childName: notification.childDisplayName,
            })}
          </Text>
          <Text
            className="text-caption text-text-secondary mt-1"
            testID={`parent-home-child-cap-notification-message-${notification.id}`}
          >
            {t(messageKey, { resetAt })}
          </Text>
        </View>
        <Pressable
          onPress={() => onDismiss(notification.id)}
          disabled={isDismissing}
          className="ms-3 px-2 py-1 rounded-button"
          accessibilityRole="button"
          accessibilityLabel={t('quota.parent.childCapHit.dismiss')}
          testID={`parent-home-child-cap-notification-dismiss-${notification.id}`}
        >
          <Text className="text-caption font-semibold text-text-secondary">
            {t('quota.parent.childCapHit.dismiss')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatFamilyNameList(profiles: Profile[], t: Translate): string {
  const names = profiles
    .map((profile) => firstNameOf(profile.displayName))
    .filter((name) => name.length > 0);
  const first = names[0];
  const second = names[1];

  if (!first) return '';
  if (names.length === 1) return first;
  if (names.length === 2 && second) {
    return `${first} ${t('common.and')} ${second}`;
  }

  return t('home.parent.familySummary.nameListWithMore', {
    names: names.slice(0, 2).join(', '),
    count: names.length - 2,
  });
}

function formatFamilyActivitySummary(
  profiles: Profile[],
  dashboard: DashboardData | undefined,
  t: Translate,
): string {
  if (profiles.length === 0) {
    return t('home.parent.familySummary.parentOnly');
  }

  const totals = familyChildActivityTotals(dashboard);
  const memberNames = formatFamilyNameList(profiles, t);

  if (totals.minutesThisWeek > 0) {
    return t('home.parent.familySummary.withMinutes', {
      memberNames,
      count: totals.minutesThisWeek,
    });
  }

  if (totals.sessionsThisWeek > 0) {
    return t('home.parent.familySummary.withSessions', {
      memberNames,
      count: totals.sessionsThisWeek,
    });
  }

  return t('home.parent.familySummary.noActivity', {
    memberNames,
  });
}

function familyChildActivityTotals(dashboard: DashboardData | undefined): {
  sessionsThisWeek: number;
  minutesThisWeek: number;
} {
  const dashboardChildren = dashboard?.children ?? [];
  return {
    sessionsThisWeek: dashboardChildren.reduce(
      (sum, child) => sum + child.sessionsThisWeek,
      0,
    ),
    minutesThisWeek: dashboardChildren.reduce(
      (sum, child) => sum + child.totalTimeThisWeek,
      0,
    ),
  };
}

function childAttentionScore(
  dashboardChild: DashboardChild | undefined,
): number {
  if (!dashboardChild) return 0;

  const weakestRetention = dashboardChild.subjects.some((subject) =>
    ['forgotten', 'weak'].includes(subject.retentionStatus),
  );
  if (dashboardChild.retentionTrend === 'declining' || weakestRetention) {
    return 3;
  }

  const fadingRetention = dashboardChild.subjects.some(
    (subject) => subject.retentionStatus === 'fading',
  );
  if (dashboardChild.trend === 'down' || fadingRetention) {
    return 2;
  }

  if (
    dashboardChild.totalSessions > 0 &&
    dashboardChild.sessionsThisWeek === 0
  ) {
    return 1;
  }

  return 0;
}

function formatFamilyAttentionSummary(
  children: Profile[],
  dashboard: DashboardData | undefined,
  t: Translate,
): string | null {
  const mostNeedsAttention = children
    .map((child) => ({
      child,
      score: childAttentionScore(findDashboardChild(dashboard, child.id)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!mostNeedsAttention) return null;

  return t('home.parent.familySummary.attentionChild', {
    childName: firstNameOf(mostNeedsAttention.child.displayName),
  });
}

function ChildActionButton({
  accentColor,
  icon,
  label,
  onPress,
  testID,
}: {
  accentColor: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  testID: string;
}): React.ReactElement {
  const handlePress = (event?: GestureResponderEvent): void => {
    event?.stopPropagation();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-1 bg-background rounded-button px-2 py-2.5 items-center justify-center min-h-[52px]"
      style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Ionicons name={icon} size={18} color={accentColor} />
      <Text
        className="text-caption font-semibold mt-1 text-center"
        style={{ color: accentColor }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  );
}

// React.memo prevents re-renders when parent re-renders but this child's
// props haven't changed. The dispatch callbacks (onNavigateToProfile etc.)
// are stable useCallback refs created by the parent, so shallow-equal holds.
const ChildCommandCard = memo(function ChildCommandCard({
  child,
  dashboardChild,
  latestRecap,
  tint,
  onNavigateToProfile,
  onNavigateToOverview,
  onNavigateToReports,
  onOpenNudge,
  onOpenLearnTogether,
  t,
}: {
  child: Profile;
  dashboardChild: DashboardChild | undefined;
  latestRecap: RecapListItem | null;
  tint: SubjectTint | undefined;
  // Stable dispatch callbacks — each receives childId so the parent can
  // define them once as useCallback without creating per-child closures.
  onNavigateToProfile: (childId: string) => void;
  onNavigateToOverview: (childId: string) => void;
  onNavigateToReports: (childId: string) => void;
  onOpenNudge: (childId: string) => void;
  onOpenLearnTogether: (childId: string) => void;
  t: Translate;
}): React.ReactElement {
  const colors = useThemeColors();
  const accent = tint?.solid ?? colors.primary;
  const softAccent = tint?.soft ?? colors.primarySoft;

  // Stable per-instance handlers — bound to this child's id so memo is safe.
  const handleOpenProfile = useCallback(
    (event?: GestureResponderEvent): void => {
      event?.stopPropagation();
      onNavigateToProfile(child.id);
    },
    [child.id, onNavigateToProfile],
  );
  const handleOpenOverview = useCallback(
    () => onNavigateToOverview(child.id),
    [child.id, onNavigateToOverview],
  );
  const handleOpenReports = useCallback(
    () => onNavigateToReports(child.id),
    [child.id, onNavigateToReports],
  );
  const handleOpenNudge = useCallback(
    () => onOpenNudge(child.id),
    [child.id, onOpenNudge],
  );
  const handleOpenLearnTogether = useCallback(
    () => onOpenLearnTogether(child.id),
    [child.id, onOpenLearnTogether],
  );

  // Mentor-briefing copy. When the dashboard row hasn't loaded yet we fall
  // back to a calm "checking in" status and skip the rich body.
  const copy = dashboardChild
    ? resolveParentCardCopy(dashboardChild, latestRecap, t)
    : null;
  const statusWord =
    copy?.statusWord ?? t('home.parent.childCard.statusPending');
  const starterPrompt: TonightPrompt | null = copy?.starter
    ? { key: `${child.id}-starter`, childId: child.id, text: copy.starter }
    : null;

  return (
    <View
      className="rounded-card px-4 py-4 bg-surface"
      style={{
        borderColor: withOpacity(accent, 0.14),
        borderWidth: 1,
      }}
      testID={`parent-home-child-card-${child.id}`}
    >
      {/* Identity row — taps through to the child overview (no mode). */}
      <Pressable
        onPress={handleOpenOverview}
        className="flex-row items-center bg-background rounded-button px-3 py-3"
        style={{
          borderColor: accent + '24',
          borderWidth: 1,
          shadowColor: accent,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 5,
          elevation: 2,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        }}
        accessibilityRole="button"
        accessibilityLabel={`${child.displayName}`}
        testID={`parent-home-check-child-${child.id}`}
      >
        <Pressable
          onPress={handleOpenProfile}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('home.parent.childProfileLabel', {
            name: child.displayName,
          })}
          testID={`parent-home-child-profile-${child.id}`}
        >
          <View
            className="w-11 h-11 rounded-full items-center justify-center me-3"
            style={{ backgroundColor: accent }}
            accessibilityElementsHidden
          >
            <Text className="text-h3 font-bold text-text-inverse">
              {initialOf(child.displayName)}
            </Text>
          </View>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h3 font-bold text-text-primary">
            {child.displayName}
          </Text>
        </View>
        <Text
          className="text-caption font-semibold text-text-secondary ms-2 text-right"
          style={{ maxWidth: 120 }}
          numberOfLines={1}
          testID={`parent-home-child-status-${child.id}`}
        >
          {statusWord}
        </Text>
        <View
          className="w-9 h-9 rounded-full items-center justify-center ms-2"
          style={{ backgroundColor: softAccent }}
          accessibilityElementsHidden
        >
          <Ionicons name="chevron-forward" size={20} color={accent} />
        </View>
      </Pressable>

      {/* Mentor-voice headline. */}
      {copy ? (
        <Text
          className="text-body-sm text-text-primary mt-3"
          testID={`parent-home-child-headline-${child.id}`}
        >
          {copy.headline}
        </Text>
      ) : null}

      {/* Positive momentum strip — hidden when there is nothing to celebrate. */}
      {copy && copy.momentum.length > 0 ? (
        <View
          className="flex-row flex-wrap mt-3"
          style={{ gap: 6 }}
          testID={`parent-home-child-momentum-${child.id}`}
        >
          {copy.momentum.map((chip) => (
            <View
              key={chip.label}
              className="flex-row items-center rounded-full px-2.5 py-1"
              style={{ backgroundColor: softAccent }}
            >
              <Text style={{ fontSize: 12 }}>{chip.icon}</Text>
              <Text
                className="text-caption font-semibold ms-1"
                style={{ color: accent }}
              >
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Condensed Solid / Coming-up — each line hidden when its field is null. */}
      {copy?.solid ? (
        <Text
          className="text-caption text-text-secondary mt-3"
          testID={`parent-home-child-solid-${child.id}`}
        >
          {copy.solid}
        </Text>
      ) : null}
      {copy?.comingUp ? (
        <Text
          className="text-caption text-text-secondary mt-1"
          testID={`parent-home-child-comingup-${child.id}`}
        >
          {copy.comingUp}
        </Text>
      ) : null}

      {/* Exactly one starter. */}
      {starterPrompt ? (
        <View className="mt-3" testID={`parent-home-child-starter-${child.id}`}>
          <Text className="text-caption font-bold uppercase text-text-secondary mb-2">
            {t('home.parent.card.tryTonight')}
          </Text>
          <ConversationStarterCard prompt={starterPrompt} tint={tint} />
        </View>
      ) : null}

      {/* Demoted action row: Learn together · Reports · Nudge. */}
      <View className="flex-row gap-2 mt-4">
        <ChildActionButton
          accentColor={accent}
          icon="school-outline"
          label={t('home.parent.childCard.learnTogetherAction')}
          onPress={handleOpenLearnTogether}
          testID={`parent-home-learn-together-${child.id}`}
        />
        <ChildActionButton
          accentColor={accent}
          icon="document-text-outline"
          label={t('home.parent.childCard.reportsAction')}
          onPress={handleOpenReports}
          testID={`parent-home-weekly-report-${child.id}`}
        />
        <ChildActionButton
          accentColor={accent}
          icon="heart-outline"
          label={t('home.parent.childCard.nudgeAction')}
          onPress={handleOpenNudge}
          testID={`parent-home-send-nudge-${child.id}`}
        />
      </View>
    </View>
  );
});

interface FamilySummaryRow {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  tone?: 'default' | 'attention';
}

function FamilySummaryPanel({
  summary,
  rows,
  attentionHeader,
}: {
  summary: string;
  rows: FamilySummaryRow[];
  attentionHeader: string | null;
}): React.ReactElement {
  const colors = useThemeColors();

  return (
    <View
      className="bg-surface rounded-card"
      style={{
        borderColor: colors.primary + '18',
        borderWidth: 1,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 2,
      }}
      testID="parent-home-family-summary"
    >
      <View className="flex-row items-start px-4 pt-4 pb-3">
        <View
          className="w-10 h-10 rounded-full bg-primary-soft items-center justify-center"
          accessibilityElementsHidden
        >
          <Ionicons name="people-outline" size={21} color={colors.primary} />
        </View>
        <View className="flex-1 ms-3">
          <Text
            className="text-body font-semibold text-text-primary"
            numberOfLines={2}
          >
            {summary}
          </Text>
        </View>
      </View>

      {attentionHeader ? (
        <Text className="text-caption font-bold uppercase text-text-secondary px-4 pb-2">
          {attentionHeader}
        </Text>
      ) : null}

      {rows.length > 0 ? (
        <View className="px-4 pb-2">
          {rows.map((row, index) => {
            const isLast = index === rows.length - 1;
            const iconColor =
              row.tone === 'attention' ? colors.warning : colors.primary;

            return (
              <View
                key={row.key}
                className="flex-row items-start"
                testID={`parent-home-family-summary-${row.key}`}
              >
                <View className="w-7 items-center">
                  <View
                    className="w-6 h-6 rounded-full bg-primary-soft items-center justify-center"
                    accessibilityElementsHidden
                  >
                    <Ionicons name={row.icon} size={14} color={iconColor} />
                  </View>
                  {!isLast ? (
                    <View
                      className="flex-1 bg-border mt-1"
                      style={{ width: 1, minHeight: 12 }}
                    />
                  ) : null}
                </View>
                <Text className="text-body-sm text-text-secondary ms-3 flex-1 mb-3">
                  {row.text}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function ParentHomeScreen({
  activeProfile,
  now,
}: ParentHomeScreenProps): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useTheme();
  const role = useActiveProfileRole();
  const linkedChildren = useLinkedChildren();
  const { data: dashboard } = useDashboard();
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
  const childCapNotifications = useChildCapNotifications();
  const dismissChildCapNotification = useDismissChildCapNotification();
  const { data: recaps } = useRecaps();
  const [sheetChildId, setSheetChildId] = useState<string | null>(null);
  const [learnTogetherChildId, setLearnTogetherChildId] = useState<
    string | null
  >(null);
  // First recap per child = latest, since listRecapsForParent sorts newest-first.
  const latestRecapByChild = useMemo(() => {
    const map = new Map<string, RecapListItem>();
    for (const recap of recaps ?? []) {
      if (!map.has(recap.childProfileId)) {
        map.set(recap.childProfileId, recap);
      }
    }
    return map;
  }, [recaps]);
  const childrenInGracePeriod = useMemo((): ChildInGracePeriod[] => {
    return (dashboard?.children ?? []).flatMap((child) => {
      if (
        child.consentStatus === 'WITHDRAWN' &&
        child.respondedAt != null &&
        isInGracePeriod(child.respondedAt)
      ) {
        return [
          {
            profileId: child.profileId,
            displayName: child.displayName,
            respondedAt: child.respondedAt,
          },
        ];
      }
      return [];
    });
  }, [dashboard]);
  const { subtitle } = getGreeting(activeProfile?.displayName ?? '', now);
  // Household pulse replaces the generic greeting subtitle when there's a real
  // activity roll-up; falls back to the greeting when there are no children.
  const householdPulse = useMemo(
    () => resolveHouseholdPulse(dashboard?.children ?? [], t),
    [dashboard, t],
  );
  const firstName = activeProfile
    ? firstNameOf(activeProfile.displayName)
    : t('home.parent.greetingFallbackName');
  const sheetChild = linkedChildren.find((child) => child.id === sheetChildId);
  const learnTogetherChild = linkedChildren.find(
    (child) => child.id === learnTogetherChildId,
  );
  const learnTogetherDashboardChild = learnTogetherChild
    ? findDashboardChild(dashboard, learnTogetherChild.id)
    : undefined;
  const learnTogetherLatestRecap = learnTogetherChild
    ? (latestRecapByChild.get(learnTogetherChild.id) ?? null)
    : null;
  const hiddenLearnTogetherPrompt = useMemo(
    () =>
      learnTogetherDashboardChild
        ? resolveParentCardCopy(
            learnTogetherDashboardChild,
            learnTogetherLatestRecap,
            t,
          ).starter
        : null,
    [learnTogetherDashboardChild, learnTogetherLatestRecap, t],
  );
  const childNames = useMemo(() => {
    return formatFamilyNameList(linkedChildren, t);
  }, [linkedChildren, t]);
  const showAddChild = isAdultOwner({
    role,
    birthYear: activeProfile?.birthYear,
  });
  const familyActivitySummary = formatFamilyActivitySummary(
    linkedChildren,
    dashboard,
    t,
  );
  const attentionSummary = formatFamilyAttentionSummary(
    linkedChildren,
    dashboard,
    t,
  );
  const familySummaryRows: FamilySummaryRow[] = [];
  if (attentionSummary) {
    familySummaryRows.push({
      key: 'attention',
      icon: 'alert-circle-outline',
      text: attentionSummary,
      tone: 'attention',
    });
  }
  if (familyData) {
    familySummaryRows.push({
      key: 'profile-limit',
      icon: 'people-outline',
      text: t('home.parent.familySummary.profileLimit', {
        count: familyData.profileCount,
        max: familyData.maxProfiles,
      }),
    });
  }
  const childTintsById = useMemo(
    () =>
      getSubjectTintMap(
        linkedChildren.map((child) => child.id),
        colorScheme,
      ),
    [colorScheme, linkedChildren],
  );

  const navigateToCreateChildProfile = useCallback(() => {
    if (Platform.OS === 'web') {
      const webLocation = globalThis as typeof globalThis & {
        location?: { assign: (url: string) => void };
      };

      if (webLocation.location) {
        webLocation.location.assign('/create-profile?for=child');
        return;
      }
    }

    router.push({
      pathname: '/create-profile',
      params: { for: 'child' },
    } as Href);
  }, [router]);

  const handleAddChild = useCallback(() => {
    navigateToCreateChildProfile();
  }, [navigateToCreateChildProfile]);

  const pushChildProfile = useCallback(
    (childProfileId: string): void => {
      router.push(childProfileHref(childProfileId, 'settings'));
    },
    [router],
  );

  // Row arrow now opens the child OVERVIEW (no mode), not Progress charts.
  // Progress stays reachable from the overview page and the Progress tab.
  const pushChildOverview = useCallback(
    (childProfileId: string): void => {
      router.push(childProfileHref(childProfileId));
    },
    [router],
  );

  // [WI-1067] Use the navigation helper so the ancestor chain is pushed
  // (child profile index first, then reports list) — a direct push to the
  // reports screen synthesises a 1-deep stack, breaking router.back().
  const pushChildReports = useCallback(
    (childProfileId: string): void => {
      pushChildReportsNav(router, childProfileId);
    },
    [router],
  );

  // Stable dispatch for the nudge sheet — avoids a new inline arrow per child
  // on every render, which would defeat ChildCommandCard's React.memo.
  const handleOpenNudge = useCallback(
    (childId: string): void => setSheetChildId(childId),
    [],
  );

  const handleOpenLearnTogether = useCallback(
    (childId: string): void => setLearnTogetherChildId(childId),
    [],
  );

  const parentInitial = initialOf(activeProfile?.displayName ?? firstName);

  return (
    <View className="flex-1 bg-background" testID="parent-home-screen">
      <View className="px-5" style={{ paddingTop: insets.top + 4 }}>
        <View className="flex-row items-center justify-between mb-2">
          <MentomateLogo size="sm" orientation="horizontal" />
          <Pressable
            onPress={() => router.push('/(app)/more/account' as Href)}
            className="w-10 h-10 rounded-full bg-primary-soft items-center justify-center"
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('home.parent.accountLink')}
            testID="parent-home-account-avatar"
          >
            <Text className="text-body font-bold text-primary">
              {parentInitial}
            </Text>
          </Pressable>
        </View>
        <Text className="text-h2 font-bold text-text-primary leading-tight">
          {firstName
            ? t('home.parent.greeting', { displayName: firstName })
            : t('home.parent.greetingNoName')}
        </Text>
        <Text
          className="text-body-sm text-text-secondary mt-0.5"
          testID="parent-home-pulse"
        >
          {householdPulse ?? subtitle}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {childrenInGracePeriod.length > 0 ? (
          <View className="mt-3">
            <WithdrawalCountdownBanner
              childrenInGracePeriod={childrenInGracePeriod}
            />
          </View>
        ) : null}

        {(childCapNotifications.data ?? []).length > 0 ? (
          <View className="mt-3" style={{ gap: 8 }}>
            {(childCapNotifications.data ?? []).map((notification) => (
              <ChildCapNotificationBanner
                key={notification.id}
                notification={notification}
                onDismiss={(notificationId) =>
                  dismissChildCapNotification.mutate(notificationId)
                }
                isDismissing={dismissChildCapNotification.isPending}
                t={t}
              />
            ))}
          </View>
        ) : null}

        {linkedChildren.length > 0 ? (
          <View className="mt-4">
            <ParentTransitionNotice
              profileId={activeProfile?.id}
              childNames={childNames}
            />
          </View>
        ) : null}

        <Text className="text-h3 font-bold text-text-primary mt-5 mb-3">
          {t('home.parent.childrenHeader')}
        </Text>

        <View style={{ gap: 10 }}>
          {linkedChildren.length === 0 ? (
            <ConnectSection onCreateChild={handleAddChild} />
          ) : null}

          {linkedChildren.map((child) => (
            <ChildCommandCard
              key={child.id}
              child={child}
              dashboardChild={findDashboardChild(dashboard, child.id)}
              latestRecap={latestRecapByChild.get(child.id) ?? null}
              tint={childTintsById.get(child.id)}
              onNavigateToProfile={pushChildProfile}
              onNavigateToOverview={pushChildOverview}
              onNavigateToReports={pushChildReports}
              onOpenNudge={handleOpenNudge}
              onOpenLearnTogether={handleOpenLearnTogether}
              t={t}
            />
          ))}
        </View>

        {/* Bottom region. One child: a calm mentor slot + a quiet "Add a
            learner" row (the family panel would just restate the one child).
            Two-plus children: the real family summary, attention row first. */}
        {linkedChildren.length >= 2 ? (
          <>
            <Text className="text-h3 font-bold text-text-primary mt-5 mb-3">
              {t('home.parent.familyManagementHeader')}
            </Text>
            <View style={{ gap: 10 }}>
              <FamilySummaryPanel
                summary={familyActivitySummary}
                rows={familySummaryRows}
                attentionHeader={
                  attentionSummary
                    ? t('home.parent.familySummary.whoNeedsYouHeader')
                    : null
                }
              />
              {showAddChild ? (
                <ConnectSection
                  onCreateChild={handleAddChild}
                  variant="compact"
                />
              ) : null}
            </View>
          </>
        ) : linkedChildren.length === 1 ? (
          <View className="mt-5" style={{ gap: 10 }}>
            {(() => {
              const onlyProfile = linkedChildren[0];
              const onlyChild = onlyProfile
                ? findDashboardChild(dashboard, onlyProfile.id)
                : undefined;
              return onlyChild ? (
                <SingleChildMentorSlot child={onlyChild} t={t} />
              ) : null;
            })()}
            {showAddChild ? (
              <ConnectSection
                onCreateChild={handleAddChild}
                variant="compact"
              />
            ) : null}
          </View>
        ) : null}

        {sheetChild ? (
          <NudgeActionSheet
            childName={sheetChild.displayName}
            childProfileId={sheetChild.id}
            onClose={() => setSheetChildId(null)}
          />
        ) : null}

        {learnTogetherChild ? (
          <LearnTogetherSheet
            child={learnTogetherChild}
            dashboardChild={learnTogetherDashboardChild}
            latestRecap={learnTogetherLatestRecap}
            hiddenPromptText={hiddenLearnTogetherPrompt}
            onClose={() => setLearnTogetherChildId(null)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
