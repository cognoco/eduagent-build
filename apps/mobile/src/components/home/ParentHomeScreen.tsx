import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { DashboardData, Profile } from '@eduagent/schemas';

import { useDashboard } from '../../hooks/use-dashboard';
import { useLearningResumeTarget } from '../../hooks/use-progress';
import { getGreeting } from '../../lib/greeting';
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
  if (dashboardChild.sessionsThisWeek === 0) return 'No activity this week';
  if (dashboardChild.sessionsThisWeek === 1) return '1 session this week';
  return `${dashboardChild.sessionsThisWeek} sessions this week`;
}

function pushChildDetail(childProfileId: string): void {
  router.push({
    pathname: '/(app)/child/[profileId]',
    params: { profileId: childProfileId },
  } as never);
}

function pushChildReports(childProfileId: string): void {
  pushChildDetail(childProfileId);
  router.push({
    pathname: '/(app)/child/[profileId]/reports',
    params: { profileId: childProfileId },
  } as never);
}

export function ParentHomeScreen({
  activeProfile,
  now,
}: ParentHomeScreenProps): React.ReactElement {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const linkedChildren = useLinkedChildren();
  const { data: dashboard } = useDashboard();
  const { data: resumeTarget } = useLearningResumeTarget();
  const [sheetChildId, setSheetChildId] = useState<string | null>(null);
  const { subtitle } = getGreeting(activeProfile?.displayName ?? '', now);
  const firstName = activeProfile?.displayName?.split(' ')[0] ?? 'there';
  const sheetChild = linkedChildren.find((child) => child.id === sheetChildId);

  const ownLearningSubtitle = useMemo(() => {
    if (!resumeTarget) return t('home.parent.cards.continueOwnEmptySubtitle');
    return t('home.parent.cards.continueOwnSubtitle', {
      subjectName: resumeTarget.subjectName,
      topicTitle: resumeTarget.topicTitle ?? resumeTarget.subjectName,
    });
  }, [resumeTarget, t]);

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
