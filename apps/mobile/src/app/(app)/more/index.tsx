import {
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  Switch,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { isAdultOwner } from '@eduagent/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../../lib/profile';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import {
  useFamilySubscription,
  useSubscription,
} from '../../../hooks/use-subscription';
import {
  useFamilyPoolBreakdownSharing,
  useUpdateFamilyPoolBreakdownSharing,
} from '../../../hooks/use-settings';
import { platformAlert } from '../../../lib/platform-alert';
import { signOutWithCleanup } from '../../../lib/sign-out';
import {
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
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
  const [isSigningOut, setIsSigningOut] = useState(false);
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
  const { t } = useTranslation();

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
  // All adults reach it here — the Family tab has been removed entirely.
  // Gated on isAdultOwner so under-18s and non-owner profiles never see it.
  const showAddChild = isAdultOwner({
    role,
    birthYear: activeProfile?.birthYear,
  });
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
        <View className="mt-6">
          <SettingsRow
            label={t('more.learningPreferences.rowLabel')}
            onPress={() => router.push('/(app)/more/learning-preferences')}
            testID="more-row-learning-preferences"
          />
        </View>

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
            {linkedChildren.length > 0 ? (
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
                  value={familyPoolBreakdownSharing ?? false}
                  onValueChange={(value) => {
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
                  accessibilityLabel={t('more.family.breakdownSharingTitle')}
                  testID="family-breakdown-sharing-toggle-switch"
                />
              </View>
            ) : null}
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
                // [BUG-723 / SEC-7] Centralized cleanup wipes per-profile +
                // global SecureStore keys AND clears the TanStack Query cache
                // before Clerk signOut, so the next signed-in user on a
                // shared device cannot inherit bookmark prompts, dictation
                // prefs, rating-prompt counters, or — via cached query data —
                // a previous user's profile id leaking into `X-Profile-Id`.
                await signOutWithCleanup({
                  clerkSignOut: signOut,
                  queryClient,
                  profileIds: profiles.map((p) => p.id),
                });
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
