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
import { useDashboard } from '../../hooks/use-dashboard';
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
import { BaseCoachingCard } from '../coaching/BaseCoachingCard';
import { childProfileHref } from '../../lib/navigation';

const SINGLE_CHILD_PROMPT_COUNT = 3;
const MULTI_CHILD_PROMPT_COUNT = 1;

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

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

// [#11] Delegates to the Hermes-safe formatter so a missing-ICU throw cannot
// crash the child-cap banner subtree. See lib/format-datetime.ts.
function formatChildCapResetAt(resetsAt: string): string {
  return formatMediumDateTime(resetsAt) || resetsAt;
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

function formatActivityLabel(
  dashboardChild: DashboardChild | undefined,
  t: Translate,
): string {
  if (!dashboardChild) return t('home.parent.childCard.statusPending');
  if (dashboardChild.totalTimeThisWeek > 0) {
    return t('home.parent.childCard.minutesThisWeek', {
      count: dashboardChild.totalTimeThisWeek,
    });
  }
  if (dashboardChild.sessionsThisWeek > 0) {
    return t('home.parent.snapshot.sessions', {
      count: dashboardChild.sessionsThisWeek,
    });
  }
  return t('home.parent.snapshot.noActivity');
}

function formatFocusLabel(
  dashboardChild: DashboardChild | undefined,
  t: Translate,
): string {
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;
  return focus ?? t('home.parent.childCard.readyToStart');
}

function formatChildSnapshot(
  dashboardChild: DashboardChild | undefined,
  t: Translate,
): string {
  const focus = formatFocusLabel(dashboardChild, t);
  const activity = formatActivityLabel(dashboardChild, t);
  return `${focus} · ${activity}`;
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

interface TonightPrompt {
  key: string;
  childId: string;
  text: string;
}

function promptText(
  childName: string,
  body: string,
  includeChildName: boolean,
): string {
  return includeChildName ? `${childName}: ${body}` : body;
}

function childHasCurrentActivity(
  dashboardChild: DashboardChild | undefined,
): boolean {
  return (
    (dashboardChild?.sessionsThisWeek ?? 0) > 0 ||
    (dashboardChild?.totalTimeThisWeek ?? 0) > 0 ||
    (dashboardChild?.exchangesThisWeek ?? 0) > 0
  );
}

function childHasAnySignal(
  dashboardChild: DashboardChild | undefined,
): boolean {
  if (!dashboardChild) return false;

  return (
    childHasCurrentActivity(dashboardChild) ||
    dashboardChild.totalSessions > 0 ||
    dashboardChild.subjects.length > 0 ||
    dashboardChild.currentlyWorkingOn.length > 0
  );
}

function addPrompt(
  prompts: TonightPrompt[],
  child: Profile,
  key: string,
  body: string,
  includeChildName: boolean,
): void {
  prompts.push({
    key: `${child.id}-${key}`,
    childId: child.id,
    text: promptText(firstNameOf(child.displayName), body, includeChildName),
  });
}

function buildSingleChildPrompts(
  child: Profile,
  dashboardChild: DashboardChild | undefined,
  t: Translate,
  includeChildName: boolean,
  maxPrompts: number,
): TonightPrompt[] {
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;
  const prompts: TonightPrompt[] = [];

  if (!childHasAnySignal(dashboardChild)) {
    return prompts;
  }

  if (focus && childHasCurrentActivity(dashboardChild)) {
    addPrompt(
      prompts,
      child,
      'active-focus',
      t('home.parent.tonight.promptWithTopic', { topic: focus }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'trickiest',
      t('home.parent.tonight.promptTrickiestWithTopic', {
        topic: focus,
      }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'next-goal',
      t('home.parent.tonight.promptNextGoalWithTopic', { topic: focus }),
      includeChildName,
    );
    return prompts.slice(0, maxPrompts);
  }

  if (focus) {
    addPrompt(
      prompts,
      child,
      'restart-focus',
      t('home.parent.tonight.promptRestartWithTopic', { topic: focus }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'trickiest',
      t('home.parent.tonight.promptTrickiestWithTopic', {
        topic: focus,
      }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'restart-easier',
      t('home.parent.tonight.promptRestartEasierWithTopic', { topic: focus }),
      includeChildName,
    );
    return prompts.slice(0, maxPrompts);
  }

  if (childHasCurrentActivity(dashboardChild)) {
    addPrompt(
      prompts,
      child,
      'weekly-easier',
      t('home.parent.tonight.promptFallback'),
      includeChildName,
    );
  } else {
    addPrompt(
      prompts,
      child,
      'restart',
      t('home.parent.tonight.promptNoActivity'),
      includeChildName,
    );
  }

  return prompts.slice(0, maxPrompts);
}

function buildChildPromptMap(
  children: Profile[],
  dashboard: DashboardData | undefined,
  t: Translate,
): Map<string, TonightPrompt[]> {
  const maxPrompts =
    children.length === 1
      ? SINGLE_CHILD_PROMPT_COUNT
      : MULTI_CHILD_PROMPT_COUNT;
  return new Map(
    children.map((child) => [
      child.id,
      buildSingleChildPrompts(
        child,
        findDashboardChild(dashboard, child.id),
        t,
        false,
        maxPrompts,
      ),
    ]),
  );
}

function ConversationStarterCard({
  prompt,
  tint,
}: {
  prompt: TonightPrompt;
  tint: SubjectTint | undefined;
}): React.ReactElement {
  const colors = useThemeColors();
  const accent = tint?.solid ?? colors.primary;
  const bubbleBorderColor = withOpacity(accent, 0.26);

  return (
    <View
      testID={`parent-home-tonight-${prompt.key}`}
      style={{
        backgroundColor: withOpacity(accent, 0.06),
        borderColor: bubbleBorderColor,
        borderRadius: 16,
        borderWidth: 1,
        minHeight: 48,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          paddingHorizontal: 10,
          paddingVertical: 9,
        }}
      >
        <View
          testID={`parent-home-tonight-icon-${prompt.key}`}
          style={{
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderColor: bubbleBorderColor,
            borderWidth: 1,
            borderRadius: 999,
            height: 28,
            justifyContent: 'center',
            width: 28,
          }}
        >
          <Ionicons name="chatbubble-outline" size={16} color={accent} />
        </View>
        <Text
          testID={`parent-home-tonight-text-${prompt.key}`}
          style={{
            color: colors.textPrimary,
            flex: 1,
            fontSize: 14,
            fontWeight: '400',
            includeFontPadding: false,
            lineHeight: 20,
            marginLeft: 9,
          }}
        >
          {prompt.text}
        </Text>
      </View>
    </View>
  );
}

function ChildConversationStarters({
  child,
  prompts,
  tint,
  t,
}: {
  child: Profile;
  prompts: TonightPrompt[];
  tint: SubjectTint | undefined;
  t: Translate;
}): React.ReactElement | null {
  const colors = useThemeColors();
  if (prompts.length === 0) return null;

  return (
    <View
      className="mt-4 border-t border-border pt-3"
      testID={`parent-home-child-prompts-${child.id}`}
    >
      <View className="flex-row items-center mb-2">
        <Ionicons
          name="chatbubbles-outline"
          size={16}
          color={tint?.solid ?? colors.primary}
          className="me-2"
        />
        <Text className="text-caption font-bold uppercase text-text-secondary">
          {t('home.parent.tonight.titleEvening')}
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        {prompts.map((prompt) => (
          <ConversationStarterCard
            key={`tonight-${prompt.key}`}
            prompt={prompt}
            tint={tint}
          />
        ))}
      </View>
    </View>
  );
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
  conversationPrompts,
  dashboardChild,
  tint,
  onNavigateToProfile,
  onNavigateToProgress,
  onNavigateToReports,
  onOpenNudge,
  t,
}: {
  child: Profile;
  conversationPrompts: TonightPrompt[];
  dashboardChild: DashboardChild | undefined;
  tint: SubjectTint | undefined;
  // Stable dispatch callbacks — each receives childId so the parent can
  // define them once as useCallback without creating per-child closures.
  onNavigateToProfile: (childId: string) => void;
  onNavigateToProgress: (childId: string) => void;
  onNavigateToReports: (childId: string) => void;
  onOpenNudge: (childId: string) => void;
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
  const handleOpenProgress = useCallback(
    () => onNavigateToProgress(child.id),
    [child.id, onNavigateToProgress],
  );
  const handleOpenReports = useCallback(
    () => onNavigateToReports(child.id),
    [child.id, onNavigateToReports],
  );
  const handleOpenNudge = useCallback(
    () => onOpenNudge(child.id),
    [child.id, onOpenNudge],
  );

  return (
    <View className="rounded-card px-4 py-4 bg-surface">
      <Pressable
        onPress={handleOpenProgress}
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
          accessibilityLabel={`${child.displayName} profile`}
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
          <Text
            className="text-body-sm text-text-secondary mt-1"
            numberOfLines={2}
          >
            {formatChildSnapshot(dashboardChild, t)}
          </Text>
        </View>
        <View
          className="w-9 h-9 rounded-full items-center justify-center ms-3"
          style={{ backgroundColor: softAccent }}
          accessibilityElementsHidden
        >
          <Ionicons name="chevron-forward" size={20} color={accent} />
        </View>
      </Pressable>

      <View className="flex-row gap-2 mt-4">
        <ChildActionButton
          accentColor={accent}
          icon="stats-chart-outline"
          label={t('home.parent.childCard.progressAction')}
          onPress={handleOpenProgress}
          testID={`parent-home-child-progress-${child.id}`}
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
      <ChildConversationStarters
        child={child}
        prompts={conversationPrompts}
        tint={tint}
        t={t}
      />
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
  showAddProfile,
  addProfileLabel,
  addProfileAccessibilityLabel,
  onAddProfile,
}: {
  summary: string;
  rows: FamilySummaryRow[];
  showAddProfile: boolean;
  addProfileLabel: string;
  addProfileAccessibilityLabel: string;
  onAddProfile: () => void;
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

      {showAddProfile ? (
        <Pressable
          onPress={onAddProfile}
          className="flex-row items-center bg-background border-t border-border px-4 py-3.5 rounded-b-card"
          style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
          accessibilityRole="button"
          accessibilityLabel={addProfileAccessibilityLabel}
          testID="parent-home-add-child"
        >
          <Ionicons
            name="person-add-outline"
            size={20}
            color={colors.textSecondary}
          />
          <Text className="text-body font-semibold text-text-primary ms-3 flex-1">
            {addProfileLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
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
  const [sheetChildId, setSheetChildId] = useState<string | null>(null);
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
  const firstName = activeProfile
    ? firstNameOf(activeProfile.displayName)
    : 'there';
  const sheetChild = linkedChildren.find((child) => child.id === sheetChildId);
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
  const childPromptsById = useMemo(
    () => buildChildPromptMap(linkedChildren, dashboard, t),
    [linkedChildren, dashboard, t],
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

  const pushChildProgress = useCallback(
    (childProfileId: string): void => {
      router.push(childProfileHref(childProfileId, 'progress'));
    },
    [router],
  );

  const pushChildReports = useCallback(
    (childProfileId: string): void => {
      router.push(`/(app)/child/${childProfileId}/reports` as Href);
    },
    [router],
  );

  // Stable dispatch for the nudge sheet — avoids a new inline arrow per child
  // on every render, which would defeat ChildCommandCard's React.memo.
  const handleOpenNudge = useCallback(
    (childId: string): void => setSheetChildId(childId),
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
            accessibilityLabel={t('home.parent.accountLink', {
              defaultValue: 'Open account',
            })}
            testID="parent-home-account-avatar"
          >
            <Text className="text-body font-bold text-primary">
              {parentInitial}
            </Text>
          </Pressable>
        </View>
        <Text className="text-h2 font-bold text-text-primary leading-tight">
          {t('home.parent.greeting', { displayName: firstName })}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-0.5">
          {subtitle}
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
            <BaseCoachingCard
              headline={t('home.parent.empty.title')}
              subtext={t('home.parent.empty.body')}
              primaryLabel={t('home.parent.empty.cta')}
              onPrimary={handleAddChild}
              testID="add-first-child-screen"
            />
          ) : null}

          {linkedChildren.map((child) => (
            <ChildCommandCard
              key={child.id}
              child={child}
              conversationPrompts={childPromptsById.get(child.id) ?? []}
              dashboardChild={findDashboardChild(dashboard, child.id)}
              tint={childTintsById.get(child.id)}
              onNavigateToProfile={pushChildProfile}
              onNavigateToProgress={pushChildProgress}
              onNavigateToReports={pushChildReports}
              onOpenNudge={handleOpenNudge}
              t={t}
            />
          ))}
        </View>

        <Text className="text-h3 font-bold text-text-primary mt-5 mb-3">
          {t('home.parent.familyManagementHeader')}
        </Text>

        <View style={{ gap: 10 }}>
          <FamilySummaryPanel
            summary={familyActivitySummary}
            rows={familySummaryRows}
            showAddProfile={showAddChild}
            addProfileLabel={t('home.parent.familySummary.addProfileAction')}
            addProfileAccessibilityLabel={t(
              'home.parent.familySummary.addProfileAccessibilityLabel',
            )}
            onAddProfile={handleAddChild}
          />
        </View>

        {sheetChild ? (
          <NudgeActionSheet
            childName={sheetChild.displayName}
            childProfileId={sheetChild.id}
            onClose={() => setSheetChildId(null)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
