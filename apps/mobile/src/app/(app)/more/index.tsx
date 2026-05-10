import { View, Text, Platform, Pressable, ScrollView } from 'react-native';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  isAdultOwner,
  type AccommodationMode,
  type CelebrationLevel,
  type KnowledgeInventory,
} from '@eduagent/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../../lib/profile';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import { isNewLearner } from '../../../lib/progressive-disclosure';
import {
  useLearnerProfile,
  useUpdateAccommodationMode,
} from '../../../hooks/use-learner-profile';
import {
  useFamilySubscription,
  useSubscription,
} from '../../../hooks/use-subscription';
import {
  useCelebrationLevel,
  useUpdateCelebrationLevel,
} from '../../../hooks/use-settings';
import { ACCOMMODATION_OPTIONS } from '../../../lib/accommodation-options';
import { track } from '../../../lib/analytics';
import { clearTransitionState } from '../../../lib/auth-transition';
import { FAMILY_HOME_PATH } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { clearProfileSecureStorageOnSignOut } from '../../../lib/sign-out-cleanup';
import {
  LearningModeOption,
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { activeProfile, profiles } = useProfile();
  // [BUG-915] When the parent is impersonating a child profile, the More tab
  // must hide account-level destructive actions (Sign out, Delete account,
  // Export my data, Subscription). Those operate on the parent's underlying
  // account and are unsafe to expose while "Viewing TestKid's account" — the
  // ProxyBanner at the top of (app)/_layout already provides the Switch-back
  // pointer, so no additional escape affordance is needed in this screen.
  // Uses the discriminated useActiveProfileRole() so the same role guard
  // shape applies in mentor-memory and the post-approval landing.
  const role = useActiveProfileRole();
  const isImpersonating = role === 'impersonated-child';
  const queryClient = useQueryClient();
  const cachedInventory = queryClient.getQueryData<KnowledgeInventory>([
    'progress',
    'inventory',
    activeProfile?.id,
  ]);
  const hideMentorMemory = isNewLearner(cachedInventory?.global.totalSessions);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
  const { data: celebrationLevel = 'big_only', isLoading: celebrationLoading } =
    useCelebrationLevel();
  const updateCelebrationLevel = useUpdateCelebrationLevel();
  const {
    data: learnerProfile,
    isError: learnerProfileError,
    refetch: refetchLearnerProfile,
  } = useLearnerProfile();
  const updateAccommodation = useUpdateAccommodationMode();
  const { t } = useTranslation();

  const handleSelectAccommodation = useCallback(
    (mode: AccommodationMode) => {
      if (mode === (learnerProfile?.accommodationMode ?? 'none')) return;
      updateAccommodation.mutate(
        { accommodationMode: mode },
        {
          onError: () => {
            platformAlert(
              t('more.errors.couldNotSaveSetting'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [learnerProfile?.accommodationMode, updateAccommodation, t],
  );

  const handleChildProgressNavigation = useCallback(
    (href: string) => {
      track('child_progress_navigated', { source: 'more_preferences_link' });
      router.push(href as never);
    },
    [router],
  );

  const handleAddChild = useCallback(() => {
    if (!subscription) {
      // Subscription query still loading — surface a non-blocking notice
      // rather than asserting an upgrade gate the user might not actually hit.
      platformAlert(t('common.loading'), t('more.errors.tryAgainMoment'));
      return;
    }
    const tier = subscription.tier;
    // Whitelist: only family/pro may add children. Blocks free and plus.
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

  const linkedChildren = activeProfile?.isOwner
    ? profiles.filter((p) => p.id !== activeProfile.id && !p.isOwner)
    : [];
  // Add-child entry is the single global path to add a child profile.
  // Solo adults reach it here (Family tab is hidden for them); existing
  // parents reach it here too. Gated on isAdultOwner so under-18s and
  // non-owner profiles never see it.
  const showAddChild = isAdultOwner({
    role,
    birthYear: activeProfile?.birthYear,
  });
  const displayName =
    activeProfile?.displayName ??
    user?.fullName ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    'User';

  const handleSelectCelebrationLevel = (nextLevel: CelebrationLevel): void => {
    if (celebrationLevel === nextLevel) return;
    updateCelebrationLevel.mutate(nextLevel, {
      onError: () => {
        platformAlert(
          t('more.errors.couldNotSaveSetting'),
          t('more.errors.tryAgain'),
        );
      },
    });
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-text-primary">
          {t('more.screenTitle')}
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        testID="more-scroll"
      >
        {/* 1. Learning Accommodation */}
        <Text
          className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-1 mt-6"
          testID="learning-accommodation-section-header"
        >
          {t('more.accommodation.sectionHeader', { name: displayName })}
        </Text>
        <Text className="text-caption text-text-secondary mb-2">
          {activeProfile?.isOwner && linkedChildren.length > 0
            ? t('more.learningMode.subtitleWithChildren')
            : t('more.learningMode.subtitle')}
        </Text>
        {activeProfile?.isOwner && linkedChildren.length === 1 ? (
          <Pressable
            onPress={() => {
              handleChildProgressNavigation(FAMILY_HOME_PATH);
            }}
            className="self-start mb-3"
            accessibilityRole="button"
            accessibilityLabel={t(
              'more.learningMode.childPreferencesAccessLabel',
              {
                name:
                  linkedChildren[0]?.displayName ?? t('more.family.yourChild'),
              },
            )}
            testID="accommodation-mode-child-link"
          >
            <Text className="text-caption font-semibold text-primary">
              {t('more.learningMode.childPreferencesLink', {
                name:
                  linkedChildren[0]?.displayName ?? t('more.family.yourChild'),
              })}
            </Text>
          </Pressable>
        ) : null}
        {activeProfile?.isOwner && linkedChildren.length >= 2 ? (
          <Pressable
            onPress={() => handleChildProgressNavigation(FAMILY_HOME_PATH)}
            className="self-start mb-3"
            accessibilityRole="button"
            accessibilityLabel={t(
              'more.family.openFamilyPreferencesAccessLabel',
            )}
            testID="accommodation-mode-family-link"
          >
            <Text className="text-caption font-semibold text-primary">
              {t('more.learningMode.familyPreferencesLink')}
            </Text>
          </Pressable>
        ) : null}
        {!learnerProfile ? (
          learnerProfileError ? (
            <View className="bg-surface rounded-card px-4 py-4 mb-2">
              <Text className="text-body-sm text-text-secondary">
                {t('session.mentorMemory.loadError')}
              </Text>
              <Pressable
                onPress={() => void refetchLearnerProfile()}
                className="self-start mt-3"
                accessibilityRole="button"
                testID="accommodation-mode-retry"
              >
                <Text className="text-caption font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-surface rounded-card px-4 py-4 mb-2">
              <Text className="text-body-sm text-text-secondary">
                {t('common.loading')}
              </Text>
            </View>
          )
        ) : (
          <>
            {learnerProfileError ? (
              <Pressable
                onPress={() => void refetchLearnerProfile()}
                className="self-start mb-3"
                accessibilityRole="button"
                testID="accommodation-mode-retry-stale"
              >
                <Text className="text-caption font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            ) : null}
            {ACCOMMODATION_OPTIONS.map((opt) => {
              const selected = learnerProfile.accommodationMode === opt.mode;
              const showsCelebrationFollowup =
                selected &&
                (opt.mode === 'short-burst' || opt.mode === 'predictable');

              return (
                <View key={opt.mode}>
                  <LearningModeOption
                    title={opt.title}
                    description={opt.description}
                    selected={selected}
                    disabled={updateAccommodation.isPending}
                    onPress={() => handleSelectAccommodation(opt.mode)}
                    testID={`accommodation-mode-${opt.mode}`}
                  />
                  {showsCelebrationFollowup ? (
                    <View
                      className="ml-4 mb-2 border-l-2 border-primary/30 pl-3"
                      testID={`celebration-followup-${opt.mode}`}
                    >
                      <Text className="text-caption font-semibold text-text-primary mb-2">
                        {t('more.celebrations.inlinePrompt')}
                      </Text>
                      <LearningModeOption
                        title={t('more.celebrations.allTitle')}
                        description={t('more.celebrations.allDescription')}
                        selected={celebrationLevel === 'all'}
                        disabled={
                          celebrationLoading || updateCelebrationLevel.isPending
                        }
                        onPress={() => handleSelectCelebrationLevel('all')}
                        testID="celebration-level-all"
                      />
                      <LearningModeOption
                        title={t('more.celebrations.bigOnlyTitle')}
                        description={t('more.celebrations.bigOnlyDescription')}
                        selected={celebrationLevel === 'big_only'}
                        disabled={
                          celebrationLoading || updateCelebrationLevel.isPending
                        }
                        onPress={() => handleSelectCelebrationLevel('big_only')}
                        testID="celebration-level-big-only"
                      />
                      <LearningModeOption
                        title={t('more.celebrations.offTitle')}
                        description={t('more.celebrations.offDescription')}
                        selected={celebrationLevel === 'off'}
                        disabled={
                          celebrationLoading || updateCelebrationLevel.isPending
                        }
                        onPress={() => handleSelectCelebrationLevel('off')}
                        testID="celebration-level-off"
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}

        {/* 2. Live product configuration */}
        {!hideMentorMemory ? (
          <>
            <SectionHeader testID="mentor-memory-section-header">
              {t('more.mentorMemory.sectionHeader')}
            </SectionHeader>
            <SettingsRow
              label={t('more.mentorMemory.viewAndManage')}
              onPress={() => router.push('/(app)/mentor-memory?returnTo=more')}
              testID="mentor-memory-link"
            />
          </>
        ) : null}

        {showAddChild ? (
          <>
            <SectionHeader>{t('more.family.sectionHeader')}</SectionHeader>
            <Pressable
              onPress={handleAddChild}
              className="bg-surface rounded-card px-4 py-3.5 mb-2"
              accessibilityLabel={t('more.family.addChildAccessLabel')}
              accessibilityRole="button"
              testID="add-child-link"
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

        {/* 3. Sub-screen links */}
        <SectionHeader>{t('more.sections.settings')}</SectionHeader>
        <SettingsRow
          label={t('more.notifications.sectionHeader')}
          onPress={() => router.push('/(app)/more/notifications')}
          testID="more-row-notifications"
        />
        <SettingsRow
          label={t('more.account.sectionHeader')}
          onPress={() => router.push('/(app)/more/account')}
          testID="more-row-account"
        />
        <SettingsRow
          label={t('more.privacy.privacyAndData')}
          onPress={() => router.push('/(app)/more/privacy')}
          testID="more-row-privacy"
        />
        <SettingsRow
          label={t('more.help.helpAndFeedback')}
          onPress={() => router.push('/(app)/more/help')}
          testID="more-row-help"
        />

        {/* [BUG-915] Hide the Sign out button in impersonation — it would sign
            out the parent's whole account session, which the user (operating
            "as the child") almost certainly does not intend. The ProxyBanner
            at the top already provides the safe Switch-back path. */}
        {!isImpersonating && (
          <Pressable
            onPress={async () => {
              if (isSigningOut) return;
              setIsSigningOut(true);
              try {
                clearTransitionState();
                // [BUG-723 / SEC-7] Wipe per-profile + global SecureStore keys
                // before signing out so the next signed-in user on a shared
                // device does not inherit bookmark prompts, dictation prefs,
                // rating-prompt counters, etc. Includes all known profileIds
                // (owner + linked children) so child-profile keys are cleared
                // too. Best-effort: per-key failure is swallowed inside the
                // helper so cleanup never blocks sign-out.
                await clearProfileSecureStorageOnSignOut(
                  profiles.map((p) => p.id),
                );
                await signOut();
              } catch {
                platformAlert(
                  t('more.account.couldNotSignOut'),
                  t('more.errors.tryAgainMoment'),
                );
                setIsSigningOut(false);
              }
            }}
            disabled={isSigningOut}
            className={
              'bg-surface rounded-card px-4 py-3.5 mt-6 items-center' +
              (isSigningOut ? ' opacity-50' : '')
            }
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
            testID="sign-out-button"
            accessibilityLabel={t('more.account.signOut')}
            accessibilityRole="button"
          >
            <Text className="text-body font-semibold text-danger">
              {t('more.account.signOut')}
            </Text>
          </Pressable>
        )}

        <View className="mt-8 items-center">
          <Text className="text-caption text-text-secondary">
            {t('more.appVersion')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
