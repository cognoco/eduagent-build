import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
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
import { getGreeting } from '../../lib/greeting';
import { platformAlert } from '../../lib/platform-alert';
import { useLinkedChildren } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import { WithdrawalCountdownBanner } from '../family/WithdrawalCountdownBanner';
import { NudgeActionSheet } from '../nudge/NudgeActionSheet';
import { ChildQuotaLine } from './ChildQuotaLine';
import { IntentCard } from './IntentCard';
import { ParentTransitionNotice } from './ParentTransitionNotice';

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

function formatSignalLabel(
  dashboardChild: DashboardChild | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!dashboardChild) return t('home.parent.childCard.statusUpdating');
  const headline = dashboardChild.weeklyHeadline;
  if (
    headline &&
    typeof headline.value === 'number' &&
    typeof headline.label === 'string'
  ) {
    return headline.comparison ?? headline.label.toLowerCase();
  }
  if (
    dashboardChild.retentionTrend === 'improving' ||
    dashboardChild.trend === 'up'
  ) {
    return t('home.parent.childCard.confidenceImproving');
  }
  if (
    dashboardChild.retentionTrend === 'declining' ||
    dashboardChild.trend === 'down'
  ) {
    return t('home.parent.childCard.needsEncouragement');
  }
  return t('home.parent.childCard.steady');
}

function formatChildSnapshot(
  dashboardChild: DashboardChild | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return t('home.parent.childCard.statusLine', {
    activity: formatActivityLabel(dashboardChild, t),
    focus: formatFocusLabel(dashboardChild, t),
    signal: formatSignalLabel(dashboardChild, t),
  });
}

function formatTonightPrompt(
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
  return (
    <Pressable
      onPress={onPress}
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
  const colors = useThemeColors();

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
      <View className="flex-row items-start justify-between">
        <View className="flex-1 me-3">
          <Text className="text-h3 font-bold text-text-primary">
            {child.displayName}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {formatChildSnapshot(dashboardChild, t)}
          </Text>
        </View>
        <Ionicons
          name="person-circle-outline"
          size={28}
          color={colors.textSecondary}
        />
      </View>

      <View className="flex-row gap-2 mt-4">
        <ChildActionButton
          icon="stats-chart-outline"
          label={t('home.parent.childCard.progressAction')}
          onPress={onOpenProgress}
          testID={`parent-home-child-progress-${child.id}`}
        />
        <ChildActionButton
          icon="calendar-outline"
          label={t('home.parent.childCard.recapAction')}
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

  return (
    <View className="flex-1 bg-background" testID="parent-home-screen">
      <View className="px-5" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-h2 font-bold text-text-primary leading-tight">
          {t('home.parent.greeting', { displayName: firstName })}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-0.5">
          {subtitle}
        </Text>
        <ChildQuotaLine />
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
              {t('home.parent.tonight.title')}
            </Text>
            <View className="bg-coaching-card rounded-card px-4 py-2">
              {linkedChildren.map((child) => {
                const dashboardChild = findDashboardChild(dashboard, child.id);
                return (
                  <Pressable
                    key={`tonight-${child.id}`}
                    onPress={() => pushChildDetail(child.id)}
                    className="flex-row items-center py-2.5"
                    style={
                      Platform.OS === 'web' ? { cursor: 'pointer' } : undefined
                    }
                    accessibilityRole="button"
                    accessibilityLabel={formatTonightPrompt(
                      child,
                      dashboardChild,
                      t,
                    )}
                    testID={`parent-home-tonight-${child.id}`}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={18}
                      color={colors.textSecondary}
                    />
                    <Text className="text-body-sm text-text-primary ms-3 flex-1">
                      {formatTonightPrompt(child, dashboardChild, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Text className="text-h3 font-bold text-text-primary mt-5 mb-3">
          {t('home.parent.childrenHeader')}
        </Text>

        <View style={{ gap: 10 }}>
          {linkedChildren.map((child, index) => (
            <ChildCommandCard
              key={child.id}
              child={child}
              dashboardChild={findDashboardChild(dashboard, child.id)}
              highlight={index === 0}
              onOpenProgress={() => pushChildDetail(child.id)}
              onOpenReports={() => pushChildReports(child.id)}
              onOpenNudge={() => setSheetChildId(child.id)}
              t={t}
            />
          ))}

          {showAddChild ? (
            <View className="mt-2">
              <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2">
                {t('home.parent.familyToolsHeader')}
              </Text>
              <IntentCard
                testID="parent-home-add-child"
                title={t('more.family.addChild')}
                subtitle={t('more.family.addChildDescription')}
                icon="person-add-outline"
                variant="subtle"
                onPress={handleAddChild}
              />
            </View>
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
