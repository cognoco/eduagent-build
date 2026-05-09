import { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ParentDashboardSummary } from '../../components/coaching';
import { ProfileSwitcher } from '../../components/common';
import { ParentOnly } from '../../components/_internal/ParentOnly';
import { FamilyOrientationCue } from '../../components/family/FamilyOrientationCue';
import { WithdrawalCountdownBanner } from '../../components/family/WithdrawalCountdownBanner';
import type { RetentionStatus } from '../../components/progress';
import { useDashboard } from '../../hooks/use-dashboard';
import {
  useFamilyPoolBreakdownSharing,
  useUpdateFamilyPoolBreakdownSharing,
} from '../../hooks/use-settings';
import {
  useFamilySubscription,
  useSubscription,
} from '../../hooks/use-subscription';
import { goBackOrReplace } from '../../lib/navigation';
import { platformAlert } from '../../lib/platform-alert';
import { useProfile } from '../../lib/profile';

function CardSkeleton(): React.ReactNode {
  return (
    <View
      className="bg-coaching-card rounded-card p-5 mt-4"
      testID="family-skeleton"
    >
      <View className="bg-border rounded h-6 w-1/2 mb-3" />
      <View className="bg-border rounded h-4 w-full mb-2" />
      <View className="bg-border rounded h-4 w-3/4 mb-4" />
      <View className="flex-row gap-2 mb-4">
        <View className="bg-border rounded-full h-7 w-24" />
        <View className="bg-border rounded-full h-7 w-20" />
      </View>
      <View className="bg-border rounded-button h-12 w-full" />
    </View>
  );
}

function DemoBanner(): React.ReactNode {
  const { t } = useTranslation();
  return (
    <View
      className="bg-accent/10 border border-accent/30 rounded-card px-4 py-3 mt-2 mb-2"
      testID="demo-banner"
      accessibilityRole="header"
      accessibilityLabel={t('dashboard.demoBannerLabel')}
    >
      <Text className="text-body-sm font-semibold text-accent">
        {t('dashboard.demoPreviewLabel')}
      </Text>
      <Text className="text-caption text-text-secondary mt-1">
        {t('dashboard.demoPreviewMessage')}
      </Text>
    </View>
  );
}

function FamilySharingToggle({
  value,
  onToggle,
  disabled,
}: {
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}): React.ReactNode {
  const { t } = useTranslation();
  return (
    <View
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
      testID="family-breakdown-sharing-toggle"
    >
      <View className="flex-1 pr-3">
        <Text className="text-body text-text-primary">
          {t('more.family.breakdownSharingTitle')}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {t('more.family.breakdownSharingDescription')}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        accessibilityLabel={t('more.family.breakdownSharingTitle')}
        testID="family-breakdown-sharing-toggle-switch"
      />
    </View>
  );
}

function renderChildCards(
  children: {
    profileId: string;
    displayName: string;
    summary: string;
    sessionsThisWeek: number;
    sessionsLastWeek: number;
    totalTimeThisWeek: number;
    totalTimeLastWeek: number;
    exchangesThisWeek: number;
    exchangesLastWeek: number;
    guidedVsImmediateRatio: number;
    trend: string;
    retentionTrend?: string;
    totalSessions?: number;
    currentStreak: number;
    totalXp: number;
    consentStatus: string | null;
    subjects: { name: string; retentionStatus: string }[];
    progress?: {
      topicsMastered: number;
      vocabularyTotal: number;
      weeklyDeltaTopicsMastered: number | null;
      weeklyDeltaVocabularyTotal: number | null;
      weeklyDeltaTopicsExplored: number | null;
      engagementTrend: 'increasing' | 'stable' | 'declining';
      guidance: string | null;
    } | null;
  }[],
  onDrillDown: (profileId: string) => void,
): React.ReactNode {
  return children.map((child) => (
    <ParentDashboardSummary
      key={child.profileId}
      profileId={child.profileId}
      childName={child.displayName}
      summary={child.summary}
      sessionsThisWeek={child.sessionsThisWeek}
      sessionsLastWeek={child.sessionsLastWeek}
      totalTimeThisWeek={child.totalTimeThisWeek}
      totalTimeLastWeek={child.totalTimeLastWeek}
      exchangesThisWeek={child.exchangesThisWeek}
      exchangesLastWeek={child.exchangesLastWeek}
      guidedVsImmediateRatio={child.guidedVsImmediateRatio}
      trend={child.trend as 'up' | 'down' | 'stable'}
      retentionTrend={
        child.retentionTrend as 'improving' | 'declining' | 'stable' | undefined
      }
      totalSessions={child.totalSessions}
      currentStreak={child.currentStreak}
      totalXp={child.totalXp}
      consentStatus={
        child.consentStatus as
          | 'PENDING'
          | 'PARENTAL_CONSENT_REQUESTED'
          | 'CONSENTED'
          | 'WITHDRAWN'
          | null
      }
      progress={child.progress}
      subjects={child.subjects.map((s) => ({
        name: s.name,
        retentionStatus: s.retentionStatus as RetentionStatus,
      }))}
      onDrillDown={() => onDrillDown(child.profileId)}
    />
  ));
}

export default function FamilyScreen() {
  return (
    <ParentOnly>
      <FamilyContent />
    </ParentOnly>
  );
}

function FamilyContent(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { returnTo: rawReturnTo } = useLocalSearchParams<{
    returnTo?: string;
  }>();
  // [BUG-905] Honor returnTo so the back button lands the parent on the screen
  // they came from. Defaults to /home — most parent dashboard entries originate
  // there via the "Check child's progress" intent card.
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;
  const backFallback: Href =
    returnTo === 'more' ? '/(app)/more' : '/(app)/home';
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError,
    refetch,
    isRefetching,
  } = useDashboard();
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
  const {
    data: familyPoolBreakdownSharing,
    isLoading: breakdownSharingLoading,
  } = useFamilyPoolBreakdownSharing();
  const updateFamilyPoolBreakdownSharing =
    useUpdateFamilyPoolBreakdownSharing();

  const isDemo = dashboard?.demoMode === true;
  const hasChildren = (dashboard?.children?.length ?? 0) > 0;
  const showFamilyManagement = !isDemo && hasChildren;

  const handleDrillDown = (profileId: string): void => {
    if (isDemo) {
      platformAlert(
        t('dashboard.demoAlertTitle'),
        t('dashboard.demoAlertMessage'),
        [{ text: t('common.done') }],
      );
      return;
    }
    router.push({
      pathname: '/(app)/child/[profileId]',
      params: { profileId },
    } as never);
  };

  const handleAddChild = useCallback(() => {
    if (!subscription) {
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
            onPress: () => router.push('/(app)/subscription' as never),
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
                onPress: () => router.push('/(app)/subscription' as never),
              },
              { text: t('common.cancel'), style: 'cancel' },
            ]
          : [{ text: t('common.ok') }],
      );
      return;
    }

    router.push('/create-profile?for=child' as never);
  }, [familyData, router, subscription, t]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* [BUG-999] zIndex:20 ensures this header wins over the ParentGateway
          header (zIndex:10) that sits in the home-tab stack on web. Without it,
          the Home header intercepts pointer events after a deep-drilldown back. */}
      <View className="px-5 pt-4 pb-2" style={{ zIndex: 20, elevation: 20 }}>
        <Pressable
          onPress={() => goBackOrReplace(router, backFallback)}
          className="mb-2 self-start"
          hitSlop={12}
          testID="dashboard-back"
          accessibilityLabel={t('dashboard.backLabel')}
          accessibilityRole="button"
        >
          <Text className="text-body text-accent">← {t('common.back')}</Text>
        </Pressable>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 me-3">
            <Text className="text-h1 font-bold text-text-primary">
              {t('family.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {isDemo ? t('dashboard.demoDashboardHint') : t('family.subtitle')}
            </Text>
          </View>
          <ProfileSwitcher
            profiles={profiles}
            activeProfileId={activeProfile?.id}
            onSwitch={switchProfile}
          />
        </View>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        testID="dashboard-scroll"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
          />
        }
      >
        <WithdrawalCountdownBanner />
        <FamilyOrientationCue />
        {dashboardLoading || (!dashboard && !isError) ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : isError ? (
          <View className="items-center justify-center py-12 px-4">
            <Text className="text-h3 font-semibold text-text-primary mb-2">
              {t('dashboard.errorTitle')}
            </Text>
            <Text className="text-body text-text-secondary text-center mb-4">
              {t('dashboard.errorMessage')}
            </Text>
            <Pressable
              onPress={() => refetch()}
              disabled={isRefetching}
              className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
              accessibilityLabel={t('dashboard.retryLoadingLabel')}
              accessibilityRole="button"
              testID="family-retry-button"
            >
              {isRefetching ? (
                <ActivityIndicator
                  size="small"
                  color="white"
                  testID="dashboard-retry-loading"
                />
              ) : (
                <Text className="text-text-inverse text-body font-semibold">
                  {t('common.retry')}
                </Text>
              )}
            </Pressable>
            <View className="flex-row gap-3 mt-3">
              <Pressable
                onPress={() => router.replace('/(app)/library' as never)}
                className="bg-surface rounded-button px-5 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.libraryFallbackLabel')}
                testID="dashboard-library-fallback"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('dashboard.libraryButton')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.replace('/(app)/more' as never)}
                className="bg-surface rounded-button px-5 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.moreFallbackLabel')}
                testID="dashboard-more-fallback"
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t('dashboard.moreButton')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : dashboard?.children && dashboard.children.length > 0 ? (
          <>
            {isDemo && <DemoBanner />}
            {renderChildCards(dashboard.children, handleDrillDown)}
            {showFamilyManagement ? (
              <>
                <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
                  {t('more.family.sectionHeader')}
                </Text>
                <FamilySharingToggle
                  value={familyPoolBreakdownSharing ?? false}
                  onToggle={(value) => {
                    updateFamilyPoolBreakdownSharing.mutate(value, {
                      onError: () => {
                        platformAlert(
                          t('more.errors.couldNotSaveSetting'),
                          t('more.family.breakdownSharingError'),
                        );
                      },
                    });
                  }}
                  disabled={
                    breakdownSharingLoading ||
                    updateFamilyPoolBreakdownSharing.isPending
                  }
                />
                <Pressable
                  onPress={handleAddChild}
                  className="bg-surface rounded-card px-4 py-3.5 mb-2"
                  accessibilityLabel={t('more.family.addChildAccessLabel')}
                  accessibilityRole="button"
                  testID="family-add-child-link"
                >
                  <Text className="text-body font-semibold text-text-primary">
                    {t('more.family.addChild')}
                  </Text>
                  <Text className="text-body-sm text-text-secondary mt-1">
                    {t('more.family.addChildDescription')}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {isDemo && (
              <Pressable
                onPress={() => router.push('/(app)/more' as never)}
                className="bg-accent rounded-button mt-6 py-3 min-h-[48px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.linkChildCtaLabel')}
                testID="demo-link-child-cta"
              >
                <Text className="text-body font-semibold text-white">
                  {t('dashboard.linkChildCta')}
                </Text>
              </Pressable>
            )}
          </>
        ) : (
          <View className="py-8 items-center" testID="dashboard-empty">
            <Text className="text-body text-text-secondary text-center mb-6">
              {t('dashboard.emptyMessage')}
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/more' as never)}
              className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center mb-3"
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.addChildLabel')}
              testID="dashboard-empty-add-child"
            >
              <Text className="text-body font-semibold text-text-inverse">
                {t('dashboard.addChild')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => goBackOrReplace(router, '/(app)/home')}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.continueSoloLabel')}
              testID="dashboard-empty-solo"
            >
              <Text className="text-body text-primary font-semibold">
                {t('dashboard.continueSolo')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
