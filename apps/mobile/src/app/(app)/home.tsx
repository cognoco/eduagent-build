import { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ParentGateway, LearnerScreen } from '../../components/home';
import { useCelebration } from '../../hooks/use-celebration';
import {
  useMarkCelebrationsSeen,
  usePendingCelebrations,
} from '../../hooks/use-celebrations';
import { useCelebrationLevel } from '../../hooks/use-settings';
import { useAckNotice, useDashboard } from '../../hooks/use-dashboard';
import { useProfile } from '../../lib/profile';

/** True when the active user is the account owner AND has at least one child profile. */
function hasLinkedChildren(
  activeProfile: { id: string; isOwner: boolean } | null,
  profiles: ReadonlyArray<{ id: string; isOwner: boolean }>
): boolean {
  return (
    activeProfile?.isOwner === true &&
    profiles.some(
      (profile) => profile.id !== activeProfile.id && !profile.isOwner
    )
  );
}

export default function HomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { profiles, activeProfile, switchProfile, isLoading } = useProfile();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const { data: pendingCelebrations } = usePendingCelebrations();
  const markCelebrationsSeen = useMarkCelebrationsSeen();
  const { data: dashboard } = useDashboard();
  const ackNotice = useAckNotice();
  const isOwner = activeProfile?.isOwner === true;
  const { CelebrationOverlay } = useCelebration({
    queue: pendingCelebrations ?? [],
    celebrationLevel,
    audience: isOwner ? 'adult' : 'child',
    onAllComplete: () => {
      markCelebrationsSeen
        .mutateAsync({
          viewer: isOwner ? 'parent' : 'child',
        })
        .catch((err) => {
          console.warn(
            '[Celebrations] Failed to mark as seen, will retry on next visit:',
            err
          );
        });
    },
  });

  // BUG-306: Add timeout so the loading spinner doesn't hang forever
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const isParentGatewayEligible = hasLinkedChildren(activeProfile, profiles);
  const [showLearnerView, setShowLearnerView] = useState(false);
  const firstNotice = isOwner ? dashboard?.pendingNotices?.[0] : undefined;
  const [visibleNoticeId, setVisibleNoticeId] = useState<string | null>(null);

  useEffect(() => {
    if (firstNotice?.id) {
      setVisibleNoticeId(firstNotice.id);
    }
  }, [firstNotice?.id]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Reset learner view when profile changes (parent switches back to their own profile)
  useEffect(() => {
    setShowLearnerView(false);
  }, [activeProfile?.id]);

  useEffect(() => {
    if (view === 'learner' && isParentGatewayEligible) {
      setShowLearnerView(true);
    }
  }, [isParentGatewayEligible, view]);

  useEffect(() => {
    if (!firstNotice || visibleNoticeId !== firstNotice.id) return;
    const timer = setTimeout(() => {
      setVisibleNoticeId(null);
      ackNotice.mutate({ id: firstNotice.id });
    }, 5000);
    return () => clearTimeout(timer);
  }, [ackNotice, firstNotice, visibleNoticeId]);

  // Neutral placeholder while profiles load — prevents flash of wrong content
  // (e.g. parent briefly seeing LearnerScreen before ParentGateway renders).
  if (isLoading && !loadingTimedOut) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (loadingTimedOut) {
    // [3B.11] Secondary navigation actions prevent dead-end when home times out
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-6"
        testID="home-loading-timeout"
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          {t('home.loadingTimeoutMessage')}
        </Text>
        <Pressable
          onPress={() => setLoadingTimedOut(false)}
          className="bg-primary rounded-button px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('home.retryLoadingLabel')}
          testID="home-loading-retry"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.retry')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(app)/library' as never)}
          className="mt-3 px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('home.goToLibraryLabel')}
          testID="timeout-library-button"
        >
          <Text className="text-primary text-body font-medium">
            {t('home.goToLibrary')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(app)/more' as never)}
          className="px-6 py-3 min-h-[48px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('home.moreOptionsLabel')}
          testID="timeout-more-button"
        >
          <Text className="text-primary text-body font-medium">
            {t('home.moreOptions')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const showParentGateway = isParentGatewayEligible && !showLearnerView;

  return (
    <View className="flex-1">
      {showParentGateway ? (
        <ParentGateway
          profiles={profiles}
          activeProfile={activeProfile}
          switchProfile={switchProfile}
          onLearn={() => setShowLearnerView(true)}
        />
      ) : (
        <LearnerScreen
          profiles={profiles}
          activeProfile={activeProfile}
          switchProfile={switchProfile}
          onBack={
            isParentGatewayEligible
              ? () => setShowLearnerView(false)
              : undefined
          }
        />
      )}
      {CelebrationOverlay}
      {firstNotice && visibleNoticeId === firstNotice.id ? (
        <View
          className="absolute left-5 right-5 bottom-8 bg-surface border border-border rounded-card px-4 py-3"
          testID="post-grace-notice-toast"
        >
          <Text className="text-body font-semibold text-text-primary">
            {firstNotice.type === 'consent_archived'
              ? t('home.notices.consentArchivedTitle', {
                  name: firstNotice.payload.childName,
                })
              : t('home.notices.consentDeletedTitle', {
                  name: firstNotice.payload.childName,
                })}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {firstNotice.type === 'consent_archived'
              ? t('home.notices.consentArchivedBody')
              : t('home.notices.consentDeletedBody')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
