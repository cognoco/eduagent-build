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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { isAdultOwner } from '@eduagent/schemas';
import type { DashboardChild, DashboardData, Profile } from '@eduagent/schemas';

import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useDashboard } from '../../hooks/use-dashboard';
import {
  useFamilySubscription,
  useSubscription,
} from '../../hooks/use-subscription';
import { getGreeting, getTimeOfDay } from '../../lib/greeting';
import { platformAlert } from '../../lib/platform-alert';
import { useLinkedChildren } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import { MentomateLogo } from '../MentomateLogo';
import { WithdrawalCountdownBanner } from '../family/WithdrawalCountdownBanner';
import { NudgeActionSheet } from '../nudge/NudgeActionSheet';
import { useChildLearnerProfile } from '../../hooks/use-learner-profile';
import { ACCOMMODATION_OPTIONS } from '../../lib/accommodation-options';
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
  return name.split(' ')[0] ?? name;
}

function formatActivityLabel(
  dashboardChild: DashboardChild | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
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
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;
  return focus ?? t('home.parent.childCard.readyToStart');
}

function formatChildSnapshot(
  dashboardChild: DashboardChild | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const focus = formatFocusLabel(dashboardChild, t);
  const activity = formatActivityLabel(dashboardChild, t);
  return `${focus} · ${activity}`;
}

interface TonightPrompt {
  key: string;
  childId: string;
  text: string;
}

function primaryPromptFor(
  child: Profile,
  dashboardChild: DashboardChild | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const childName = firstNameOf(child.displayName);
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;

  if (focus) {
    return t('home.parent.tonight.promptWithTopic', {
      childName,
      topic: focus,
    });
  }

  if (dashboardChild && dashboardChild.sessionsThisWeek === 0) {
    return t('home.parent.tonight.promptNoActivity', { childName });
  }

  return t('home.parent.tonight.promptFallback', { childName });
}

function buildSingleChildPrompts(
  child: Profile,
  dashboardChild: DashboardChild | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): TonightPrompt[] {
  const childName = firstNameOf(child.displayName);
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;
  const prompts: TonightPrompt[] = [
    {
      key: `${child.id}-primary`,
      childId: child.id,
      text: primaryPromptFor(child, dashboardChild, t),
    },
  ];

  if (focus) {
    prompts.push({
      key: `${child.id}-trickiest`,
      childId: child.id,
      text: t('home.parent.tonight.promptTrickiestWithTopic', {
        childName,
        topic: focus,
      }),
    });
    prompts.push({
      key: `${child.id}-tomorrow`,
      childId: child.id,
      text: t('home.parent.tonight.promptTomorrow', { childName }),
    });
  } else if (dashboardChild && dashboardChild.sessionsThisWeek > 0) {
    prompts.push({
      key: `${child.id}-tomorrow`,
      childId: child.id,
      text: t('home.parent.tonight.promptTomorrow', { childName }),
    });
  } else {
    prompts.push({
      key: `${child.id}-curious`,
      childId: child.id,
      text: t('home.parent.tonight.promptCurious', { childName }),
    });
  }

  return prompts.slice(0, MAX_TONIGHT_PROMPTS);
}

function buildTonightPrompts(
  children: Profile[],
  dashboard: DashboardData | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): TonightPrompt[] {
  const first = children[0];
  if (!first) return [];
  if (children.length === 1) {
    return buildSingleChildPrompts(
      first,
      findDashboardChild(dashboard, first.id),
      t,
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
    text: primaryPromptFor(child, findDashboardChild(dashboard, child.id), t),
  }));
}

function tonightTitleKey(now?: Date): string {
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
  highlight,
  onOpenProgress,
  onOpenReports,
  onOpenNudge,
  t,
}: {
  child: Profile;
  dashboardChild: DashboardChild | undefined;
  highlight: boolean;
  onOpenProgress: () => void;
  onOpenReports: () => void;
  onOpenNudge: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onOpenProgress}
      className={`rounded-card px-4 py-4 ${
        highlight ? 'bg-primary-soft' : 'bg-surface'
      }`}
      style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
      accessibilityRole="button"
      accessibilityLabel={child.displayName}
      testID={`parent-home-check-child-${child.id}`}
    >
      <View className="flex-row items-start">
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
          <Text className="text-body-sm text-text-secondary mt-1">
            {formatChildSnapshot(dashboardChild, t)}
          </Text>
        </View>
      </View>

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
    </Pressable>
  );
}

function ChildAccommodationRow({
  childProfileId,
  childName,
}: {
  childProfileId: string;
  childName: string;
}): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const { data: learnerProfile } = useChildLearnerProfile(childProfileId);

  const activeOption = ACCOMMODATION_OPTIONS.find(
    (o) => o.mode === (learnerProfile?.accommodationMode ?? 'none'),
  );

  return (
    <Pressable
      onPress={() =>
        router.push(
          `/(app)/more/accommodation?childProfileId=${childProfileId}`,
        )
      }
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
      style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
      accessibilityRole="button"
      accessibilityLabel={t('more.accommodation.childScreenTitle', {
        name: childName,
      })}
      testID={`child-accommodation-row-${childProfileId}`}
    >
      <View className="flex-1 pr-3">
        <Text className="text-body font-semibold text-text-primary">
          {t('more.accommodation.childScreenTitle', { name: childName })}
        </Text>
        {activeOption ? (
          <Text className="text-body-sm text-text-secondary mt-0.5">
            {activeOption.title} — {activeOption.description}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
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
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
  const [sheetChildId, setSheetChildId] = useState<string | null>(null);
  const { subtitle } = getGreeting(activeProfile?.displayName ?? '', now);
  const firstName = activeProfile?.displayName?.split(' ')[0] ?? 'there';
  const sheetChild = linkedChildren.find((child) => child.id === sheetChildId);
  const childNames = useMemo(() => {
    const names = linkedChildren.map(
      (c) => c.displayName?.split(' ')[0] ?? c.displayName,
    );
    if (names.length === 0) return '';
    if (names.length === 1) return names[0] ?? '';
    if (names.length === 2) return `${names[0]} ${t('common.and')} ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} ${t('common.and')} ${names[names.length - 1]}`;
  }, [linkedChildren, t]);
  const showAddChild = isAdultOwner({
    role,
    birthYear: activeProfile?.birthYear,
  });

  const handleAddChild = useCallback(() => {
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
            onPress: () => router.push('/(app)/subscription'),
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
                onPress: () => router.push('/(app)/subscription'),
              },
              { text: t('common.cancel'), style: 'cancel' },
            ]
          : [{ text: t('common.ok') }],
      );
      return;
    }
    router.push('/create-profile?for=child');
  }, [subscription, familyData, router, t]);

  function pushChildDetail(childProfileId: string): void {
    router.push(`/(app)/child/${childProfileId}` as never);
  }

  function pushChildReports(childProfileId: string): void {
    router.push(`/(app)/child/${childProfileId}/reports` as never);
  }

  const parentInitial = initialOf(activeProfile?.displayName ?? firstName);

  return (
    <View className="flex-1 bg-background" testID="parent-home-screen">
      <View className="px-5" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between mb-3">
          <MentomateLogo size="sm" orientation="horizontal" />
          <Pressable
            onPress={() => router.push('/(app)/more/account' as never)}
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
          <WithdrawalCountdownBanner />
        </View>
        <ParentTransitionNotice
          profileId={activeProfile?.id}
          childNames={childNames}
        />

        {linkedChildren.length > 0 ? (
          <View className="mt-5" testID="parent-home-tonight-section">
            <Text className="text-h3 font-bold text-text-primary mb-3">
              {t(tonightTitleKey(now))}
            </Text>
            <View className="bg-coaching-card rounded-card px-4 py-2">
              {buildTonightPrompts(linkedChildren, dashboard, t).map(
                (prompt) => (
                  <Pressable
                    key={`tonight-${prompt.key}`}
                    onPress={() => pushChildDetail(prompt.childId)}
                    className="flex-row items-center py-2.5"
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

          {linkedChildren.map((child, index) => (
            <ChildCommandCard
              key={child.id}
              child={child}
              dashboardChild={findDashboardChild(dashboard, child.id)}
              highlight={index === 0}
              onOpenProgress={() => pushChildReports(child.id)}
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
          {linkedChildren.map((child) => (
            <ChildAccommodationRow
              key={`accommodation-${child.id}`}
              childProfileId={child.id}
              childName={child.displayName}
            />
          ))}

          {showAddChild ? (
            <Pressable
              onPress={handleAddChild}
              className="flex-row items-center bg-surface rounded-card px-4 py-3"
              style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
              accessibilityRole="button"
              accessibilityLabel={t('more.family.addChild')}
              testID="parent-home-add-child"
            >
              <Ionicons
                name="person-add-outline"
                size={20}
                color={colors.textSecondary}
              />
              <Text className="text-body font-semibold text-text-primary ms-3 flex-1">
                {t('more.family.addChild')}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
          ) : null}
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
