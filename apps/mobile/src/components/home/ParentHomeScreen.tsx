import { useCallback, useMemo, useState } from 'react';
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
import type { DashboardChild, DashboardData, Profile } from '@eduagent/schemas';
import { isInGracePeriod } from '../../lib/consent-grace';
import type { Translate, TranslateKey } from '../../i18n';

import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useDashboard } from '../../hooks/use-dashboard';
import { useLearningResumeTarget } from '../../hooks/use-progress';
import {
  useFamilySubscription,
  useSubscription,
} from '../../hooks/use-subscription';
import { getGreeting, getTimeOfDay } from '../../lib/greeting';
import { platformAlert } from '../../lib/platform-alert';
import { useLinkedChildren } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import { MentomateLogo } from '../MentomateLogo';
import {
  WithdrawalCountdownBanner,
  type ChildInGracePeriod,
} from '../family/WithdrawalCountdownBanner';
import { NudgeActionSheet } from '../nudge/NudgeActionSheet';
import { ParentTransitionNotice } from './ParentTransitionNotice';

const MAX_TONIGHT_PROMPTS = 3;

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
  hasParentLearning: boolean,
  t: Translate,
): string {
  if (hasParentLearning) {
    if (profiles.length === 0) {
      return t('home.parent.familySummary.parentOnly');
    }

    return t('home.parent.familySummary.withParent', {
      memberNames: formatFamilyNameList(profiles, t),
    });
  }

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

function formatFamilyChildActivityDetail(
  profiles: Profile[],
  dashboard: DashboardData | undefined,
  t: Translate,
): string {
  const totals = familyChildActivityTotals(dashboard);
  const memberNames = formatFamilyNameList(profiles, t);

  if (totals.minutesThisWeek > 0) {
    return t('home.parent.familySummary.childMinutes', {
      memberNames,
      count: totals.minutesThisWeek,
    });
  }

  if (totals.sessionsThisWeek > 0) {
    return t('home.parent.familySummary.childSessions', {
      memberNames,
      count: totals.sessionsThisWeek,
    });
  }

  return t('home.parent.familySummary.childNoActivity', { memberNames });
}

function formatParentLearningSummary(
  resumeTarget:
    | {
        subjectName: string;
        topicTitle: string | null;
        lastActivityAt: string | null;
      }
    | null
    | undefined,
  t: Translate,
): string | null {
  if (!resumeTarget?.lastActivityAt) return null;

  if (resumeTarget.topicTitle) {
    return t('home.parent.familySummary.parentLearningWithTopic', {
      topicTitle: resumeTarget.topicTitle,
      subjectName: resumeTarget.subjectName,
    });
  }

  return t('home.parent.familySummary.parentLearningWithSubject', {
    subjectName: resumeTarget.subjectName,
  });
}

function formatParentExampleSummary(
  hasParentLearning: boolean,
  childCount: number,
  t: Translate,
): string | null {
  if (hasParentLearning) {
    return t('home.parent.familySummary.parentExampleLead');
  }

  if (childCount > 0) {
    return t('home.parent.familySummary.parentExampleNudge');
  }

  return null;
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

function primaryPromptFor(
  child: Profile,
  dashboardChild: DashboardChild | undefined,
  t: Translate,
  includeChildName: boolean,
): string {
  const childName = firstNameOf(child.displayName);
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;

  if (focus) {
    return promptText(
      childName,
      t('home.parent.tonight.promptWithTopic', { topic: focus }),
      includeChildName,
    );
  }

  if (dashboardChild && dashboardChild.sessionsThisWeek === 0) {
    return promptText(
      childName,
      t('home.parent.tonight.promptNoActivity'),
      includeChildName,
    );
  }

  return promptText(
    childName,
    t('home.parent.tonight.promptFallback'),
    includeChildName,
  );
}

function buildSingleChildPrompts(
  child: Profile,
  dashboardChild: DashboardChild | undefined,
  t: Translate,
  includeChildName: boolean,
): TonightPrompt[] {
  const childName = firstNameOf(child.displayName);
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;
  const prompts: TonightPrompt[] = [
    {
      key: `${child.id}-primary`,
      childId: child.id,
      text: primaryPromptFor(child, dashboardChild, t, includeChildName),
    },
  ];

  if (focus) {
    prompts.push({
      key: `${child.id}-trickiest`,
      childId: child.id,
      text: promptText(
        childName,
        t('home.parent.tonight.promptTrickiestWithTopic', {
          topic: focus,
        }),
        includeChildName,
      ),
    });
    prompts.push({
      key: `${child.id}-tomorrow`,
      childId: child.id,
      text: promptText(
        childName,
        t('home.parent.tonight.promptTomorrow'),
        includeChildName,
      ),
    });
  } else if (dashboardChild && dashboardChild.sessionsThisWeek > 0) {
    prompts.push({
      key: `${child.id}-tomorrow`,
      childId: child.id,
      text: promptText(
        childName,
        t('home.parent.tonight.promptTomorrow'),
        includeChildName,
      ),
    });
  } else {
    prompts.push({
      key: `${child.id}-curious`,
      childId: child.id,
      text: promptText(
        childName,
        t('home.parent.tonight.promptCurious'),
        includeChildName,
      ),
    });
  }

  return prompts.slice(0, MAX_TONIGHT_PROMPTS);
}

function buildTonightPrompts(
  children: Profile[],
  dashboard: DashboardData | undefined,
  t: Translate,
): TonightPrompt[] {
  const first = children[0];
  if (!first) return [];
  if (children.length === 1) {
    return buildSingleChildPrompts(
      first,
      findDashboardChild(dashboard, first.id),
      t,
      false,
    );
  }

  const ranked = [...children].sort((a, b) => {
    const aSessions =
      findDashboardChild(dashboard, a.id)?.sessionsThisWeek ?? 0;
    const bSessions =
      findDashboardChild(dashboard, b.id)?.sessionsThisWeek ?? 0;
    return bSessions - aSessions;
  });

  return ranked.slice(0, MAX_TONIGHT_PROMPTS).map((child) => ({
    key: `${child.id}-primary`,
    childId: child.id,
    text: primaryPromptFor(
      child,
      findDashboardChild(dashboard, child.id),
      t,
      true,
    ),
  }));
}

function tonightTitleKey(now?: Date): TranslateKey {
  const tod = getTimeOfDay(now ?? new Date());
  if (tod === 'morning') return 'home.parent.tonight.titleMorning';
  if (tod === 'afternoon') return 'home.parent.tonight.titleAfternoon';
  return 'home.parent.tonight.titleEvening';
}

function ChildActionButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  testID: string;
}): React.ReactElement {
  const colors = useThemeColors();
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
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text
        className="text-caption font-semibold text-primary mt-1 text-center"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ChildCommandCard({
  child,
  dashboardChild,
  onOpenProfile,
  onOpenProgress,
  onOpenReports,
  onOpenNudge,
  t,
}: {
  child: Profile;
  dashboardChild: DashboardChild | undefined;
  onOpenProfile: () => void;
  onOpenProgress: () => void;
  onOpenReports: () => void;
  onOpenNudge: () => void;
  t: Translate;
}): React.ReactElement {
  const colors = useThemeColors();

  return (
    <View className="rounded-card px-4 py-4 bg-surface">
      <Pressable
        onPress={onOpenProfile}
        className="flex-row items-center bg-background rounded-button px-3 py-3"
        style={{
          borderColor: colors.primary + '24',
          borderWidth: 1,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 5,
          elevation: 2,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        }}
        accessibilityRole="button"
        accessibilityLabel={child.displayName}
        testID={`parent-home-check-child-${child.id}`}
      >
        <View
          className="w-11 h-11 rounded-full bg-primary items-center justify-center me-3"
          accessibilityElementsHidden
        >
          <Text className="text-h3 font-bold text-text-inverse">
            {initialOf(child.displayName)}
          </Text>
        </View>
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
          className="w-9 h-9 rounded-full bg-primary-soft items-center justify-center ms-3"
          accessibilityElementsHidden
        >
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </View>
      </Pressable>

      <View className="flex-row gap-2 mt-4">
        <ChildActionButton
          icon="stats-chart-outline"
          label={t('home.parent.childCard.progressAction')}
          onPress={onOpenProgress}
          testID={`parent-home-child-progress-${child.id}`}
        />
        <ChildActionButton
          icon="document-text-outline"
          label={t('home.parent.childCard.reportsAction')}
          onPress={onOpenReports}
          testID={`parent-home-weekly-report-${child.id}`}
        />
        <ChildActionButton
          icon="heart-outline"
          label={t('home.parent.childCard.nudgeAction')}
          onPress={onOpenNudge}
          testID={`parent-home-send-nudge-${child.id}`}
        />
      </View>
    </View>
  );
}

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
  const colors = useThemeColors();
  const role = useActiveProfileRole();
  const linkedChildren = useLinkedChildren();
  const { data: dashboard } = useDashboard();
  const { data: parentResumeTarget } = useLearningResumeTarget();
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
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
  const hasNoLinkedChildren = linkedChildren.length === 0;
  const parentLearningSummary = formatParentLearningSummary(
    parentResumeTarget,
    t,
  );
  const familyActivitySummary = formatFamilyActivitySummary(
    linkedChildren,
    dashboard,
    parentLearningSummary !== null,
    t,
  );
  const childActivityDetail =
    parentLearningSummary && linkedChildren.length > 0
      ? formatFamilyChildActivityDetail(linkedChildren, dashboard, t)
      : null;
  const parentExampleSummary = formatParentExampleSummary(
    parentLearningSummary !== null,
    linkedChildren.length,
    t,
  );
  const attentionSummary = formatFamilyAttentionSummary(
    linkedChildren,
    dashboard,
    t,
  );
  const familySummaryRows: FamilySummaryRow[] = [];
  if (childActivityDetail) {
    familySummaryRows.push({
      key: 'linked-profiles',
      icon: 'school-outline',
      text: childActivityDetail,
    });
  }
  if (parentLearningSummary) {
    familySummaryRows.push({
      key: 'own-learning',
      icon: 'book-outline',
      text: parentLearningSummary,
    });
  }
  if (parentExampleSummary) {
    familySummaryRows.push({
      key: 'next-step',
      icon: 'sparkles-outline',
      text: parentExampleSummary,
    });
  }
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

  const navigateToSubscription = useCallback(() => {
    router.push('/(app)/subscription' as Href);
  }, [router]);

  const handleAddChild = useCallback(() => {
    if (hasNoLinkedChildren) {
      navigateToCreateChildProfile();
      return;
    }

    if (!subscription) {
      platformAlert(t('common.loading'), t('more.errors.tryAgainMoment'));
      return;
    }
    const tier = subscription.tier;
    if (tier !== 'family' && tier !== 'pro') {
      platformAlert(
        t('more.family.upgradeRequiredTitle'),
        t('more.family.upgradeRequiredMessage'),
        [
          {
            text: t('more.family.viewPlans'),
            onPress: navigateToSubscription,
          },
          { text: t('common.cancel'), style: 'cancel' },
        ],
      );
      return;
    }
    if (familyData && familyData.profileCount >= familyData.maxProfiles) {
      platformAlert(
        t('more.family.profileLimitTitle'),
        t('more.family.profileLimitMessage', {
          plan: tier === 'pro' ? 'Pro' : 'Family',
          max: familyData.maxProfiles,
        }),
        tier === 'family'
          ? [
              {
                text: t('more.family.viewPlans'),
                onPress: navigateToSubscription,
              },
              { text: t('common.cancel'), style: 'cancel' },
            ]
          : [{ text: t('common.ok') }],
      );
      return;
    }
    navigateToCreateChildProfile();
  }, [
    hasNoLinkedChildren,
    subscription,
    familyData,
    t,
    navigateToCreateChildProfile,
    navigateToSubscription,
  ]);

  const pushChildProfile = useCallback(
    (childProfileId: string): void => {
      router.push({
        pathname: '/(app)/child/[profileId]',
        params: { profileId: childProfileId, mode: 'settings' },
      } as Href);
    },
    [router],
  );

  const pushChildProgress = useCallback(
    (childProfileId: string): void => {
      router.push({
        pathname: '/(app)/child/[profileId]',
        params: { profileId: childProfileId, mode: 'progress' },
      } as Href);
    },
    [router],
  );

  const pushChildReports = useCallback(
    (childProfileId: string): void => {
      router.push(`/(app)/child/${childProfileId}/reports` as Href);
    },
    [router],
  );

  const parentInitial = initialOf(activeProfile?.displayName ?? firstName);

  return (
    <View className="flex-1 bg-background" testID="parent-home-screen">
      <View className="px-5" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between mb-3">
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
        <View className="mt-4">
          <WithdrawalCountdownBanner
            childrenInGracePeriod={childrenInGracePeriod}
          />
        </View>
        {linkedChildren.length > 0 ? (
          <ParentTransitionNotice
            profileId={activeProfile?.id}
            childNames={childNames}
          />
        ) : null}

        {linkedChildren.length > 0 ? (
          <View className="mt-5" testID="parent-home-tonight-section">
            <Text className="text-h3 font-bold text-text-primary mb-3">
              {t(tonightTitleKey(now))}
            </Text>
            <View style={{ gap: 10 }}>
              {buildTonightPrompts(linkedChildren, dashboard, t).map(
                (prompt) => (
                  <Pressable
                    key={`tonight-${prompt.key}`}
                    onPress={() => pushChildProgress(prompt.childId)}
                    className="bg-coaching-card rounded-card px-4 py-3 flex-row items-start"
                    style={
                      Platform.OS === 'web' ? { cursor: 'pointer' } : undefined
                    }
                    accessibilityRole="button"
                    accessibilityLabel={prompt.text}
                    testID={`parent-home-tonight-${prompt.key}`}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={18}
                      color={colors.textSecondary}
                      style={{ marginTop: 2 }}
                    />
                    <Text className="text-body-sm text-text-primary ms-3 flex-1">
                      {prompt.text}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </View>
        ) : null}

        <Text className="text-h3 font-bold text-text-primary mt-5 mb-3">
          {t('home.parent.childrenHeader')}
        </Text>

        <View style={{ gap: 10 }}>
          {linkedChildren.length === 0 ? (
            <View
              className="bg-coaching-card rounded-card px-5 py-5"
              testID="add-first-child-screen"
            >
              <Text className="text-h3 font-bold text-text-primary">
                {t('home.parent.empty.title')}
              </Text>
              <Text className="text-body text-text-secondary mt-2">
                {t('home.parent.empty.body')}
              </Text>
              <Pressable
                onPress={handleAddChild}
                className="bg-primary rounded-button px-4 py-3 mt-5 items-center min-h-[48px] justify-center"
                style={
                  Platform.OS === 'web' ? { cursor: 'pointer' } : undefined
                }
                accessibilityRole="button"
                accessibilityLabel={t('home.parent.empty.cta')}
                testID="add-first-child-cta"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('home.parent.empty.cta')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {linkedChildren.map((child) => (
            <ChildCommandCard
              key={child.id}
              child={child}
              dashboardChild={findDashboardChild(dashboard, child.id)}
              onOpenProfile={() => pushChildProfile(child.id)}
              onOpenProgress={() => pushChildProgress(child.id)}
              onOpenReports={() => pushChildReports(child.id)}
              onOpenNudge={() => setSheetChildId(child.id)}
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
