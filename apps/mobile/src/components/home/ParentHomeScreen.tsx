import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { isAdultOwner } from '@eduagent/schemas';
import type { DashboardData, Profile } from '@eduagent/schemas';

import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useDashboard } from '../../hooks/use-dashboard';
import { useLearningResumeTarget } from '../../hooks/use-progress';
import {
  useFamilySubscription,
  useSubscription,
} from '../../hooks/use-subscription';
import { getGreeting } from '../../lib/greeting';
import { platformAlert } from '../../lib/platform-alert';
import { useLinkedChildren } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import { FamilyOrientationCue } from '../family/FamilyOrientationCue';
import { WithdrawalCountdownBanner } from '../family/WithdrawalCountdownBanner';
import { NudgeActionSheet } from '../nudge/NudgeActionSheet';
import { ChildQuotaLine } from './ChildQuotaLine';
import { IntentCard } from './IntentCard';
import { ParentTransitionNotice } from './ParentTransitionNotice';

interface ParentHomeScreenProps {
  activeProfile: Profile | null;
  now?: Date;
}

function formatChildSnapshot(
  child: Profile,
  dashboard: DashboardData | undefined,
  fallback: string,
): string {
  const dashboardChild = dashboard?.children.find(
    (entry) => entry.profileId === child.id,
  );
  if (!dashboardChild) return fallback;

  const headline = dashboardChild.weeklyHeadline;
  if (
    headline &&
    typeof headline.value === 'number' &&
    typeof headline.label === 'string'
  ) {
    const value = `${headline.value} ${headline.label.toLowerCase()}`;
    return headline.comparison ? `${value} — ${headline.comparison}` : value;
  }

  if (dashboardChild.sessionsThisWeek === 0) return 'No activity this week';
  if (dashboardChild.sessionsThisWeek === 1) return '1 session this week';
  return `${dashboardChild.sessionsThisWeek} sessions this week`;
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
  const { data: resumeTarget } = useLearningResumeTarget();
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
  const [sheetChildId, setSheetChildId] = useState<string | null>(null);
  const { subtitle } = getGreeting(activeProfile?.displayName ?? '', now);
  const firstName = activeProfile?.displayName?.split(' ')[0] ?? 'there';
  const sheetChild = linkedChildren.find((child) => child.id === sheetChildId);
  const showAddChild = isAdultOwner({
    role,
    birthYear: activeProfile?.birthYear,
  });

  const ownLearningSubtitle = useMemo(() => {
    if (!resumeTarget) return t('home.parent.cards.continueOwnEmptySubtitle');
    return t('home.parent.cards.continueOwnSubtitle', {
      subjectName: resumeTarget.subjectName,
      topicTitle: resumeTarget.topicTitle ?? resumeTarget.subjectName,
    });
  }, [resumeTarget, t]);

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
    router.push({
      pathname: '/(app)/child/[profileId]',
      params: { profileId: childProfileId },
    } as never);
  }

  function pushChildReports(childProfileId: string): void {
    pushChildDetail(childProfileId);
    setTimeout(() => {
      router.push({
        pathname: '/(app)/child/[profileId]/reports',
        params: { profileId: childProfileId },
      } as never);
    }, 0);
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
        <ParentTransitionNotice profileId={activeProfile?.id} />

        <Text className="text-h3 font-bold text-text-primary mt-5 mb-3">
          {t('home.parent.intentHeader')}
        </Text>

        <View style={{ gap: 10 }}>
          {linkedChildren.map((child, index) => (
            <IntentCard
              key={`check-${child.id}`}
              testID={`parent-home-check-child-${child.id}`}
              title={t('home.parent.cards.checkChild', {
                childName: child.displayName,
              })}
              subtitle={formatChildSnapshot(
                child,
                dashboard,
                t('home.parent.cards.checkChildFallback', {
                  childName: child.displayName,
                }),
              )}
              icon="stats-chart-outline"
              variant={index === 0 ? 'highlight' : 'default'}
              onPress={() => pushChildDetail(child.id)}
            />
          ))}

          {linkedChildren.map((child) => (
            <IntentCard
              key={`weekly-${child.id}`}
              testID={`parent-home-weekly-report-${child.id}`}
              title={t('home.parent.cards.weeklyReport', {
                childName: child.displayName,
              })}
              subtitle={t('home.parent.cards.weeklyReportSubtitle')}
              icon="calendar-outline"
              onPress={() => pushChildReports(child.id)}
            />
          ))}

          {linkedChildren.map((child) => (
            <IntentCard
              key={`nudge-${child.id}`}
              testID={`parent-home-send-nudge-${child.id}`}
              title={t('home.parent.cards.sendNudge', {
                childName: child.displayName,
              })}
              subtitle={t('home.parent.cards.sendNudgeSubtitle')}
              icon="heart-outline"
              variant="subtle"
              onPress={() => setSheetChildId(child.id)}
            />
          ))}

          {showAddChild ? (
            <IntentCard
              testID="parent-home-add-child"
              title={t('more.family.addChild')}
              subtitle={t('more.family.addChildDescription')}
              icon="person-add-outline"
              variant="subtle"
              onPress={handleAddChild}
            />
          ) : null}

          <IntentCard
            testID="parent-home-own-learning"
            title={t('home.parent.cards.continueOwn')}
            subtitle={ownLearningSubtitle}
            icon="school-outline"
            onPress={() => router.push('/(app)/own-learning' as never)}
          />
        </View>

        <View className="mt-3">
          <FamilyOrientationCue />
        </View>

        <View
          className="mt-3 flex-row items-center"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={colors.textSecondary}
          />
          <Text className="text-caption text-text-secondary ml-2">
            {t('home.parent.encouragementNote')}
          </Text>
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
