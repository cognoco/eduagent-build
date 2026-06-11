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
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../../lib/profile';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import {
  useFamilySubscription,
  useSubscription,
} from '../../../hooks/use-subscription';
import {
  useFamilyPoolBreakdownSharing,
  useUpdateFamilyPoolBreakdownSharing,
} from '../../../hooks/use-settings';
import { platformAlert } from '../../../lib/platform-alert';
import {
  ClerkSignOutTimeoutError,
  signOutWithCleanup,
} from '../../../lib/sign-out';
import {
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut, userId } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const navigationContract = useNavigationContract();
  const isImpersonating = navigationContract.isParentProxy;
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: subscription } = useSubscription();
  useFamilySubscription(
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
      if (navigationContract.gates.showAddChild) {
        router.push({
          pathname: '/create-profile',
          params: { for: 'child' },
        } as never);
        return;
      }
      // Subscription query still loading and the navigation gate is not ready
      // either — surface a non-blocking notice rather than guessing the tier.
      platformAlert(t('common.loading'), t('more.errors.tryAgainMoment'));
      return;
    }

    router.push({
      pathname: '/create-profile',
      params: { for: 'child' },
    } as never);
  }, [subscription, navigationContract.gates.showAddChild, router, t]);

  const linkedChildren =
    navigationContract.gates.showRemoveFamilyMember && activeProfile
      ? profiles.filter((p) => p.id !== activeProfile.id && !p.isOwner)
      : [];
  const showAddChild = navigationContract.gates.showAddChild;

  if (isImpersonating) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="px-5 pt-4 pb-2">
          <Text className="text-h1 font-bold text-text-primary">
            {t('more.screenTitle')}
          </Text>
        </View>
        <View className="px-5 pt-4">
          <View
            className="bg-warning/10 border border-warning/30 rounded-card px-4 py-4"
            testID="more-proxy-preview-locked"
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('more.proxyPreview.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              {t('more.proxyPreview.description')}
            </Text>
          </View>
        </View>
        <View className="mt-auto mb-8 items-center">
          <Text className="text-caption text-text-secondary">
            {t('more.appVersion')}
          </Text>
        </View>
      </View>
    );
  }

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
        <SectionHeader>
          {t('more.learningPreferences.sectionHeader')}
        </SectionHeader>
        <View className="gap-2">
          <SettingsRow
            label={t('more.learningPreferences.rowLabel')}
            onPress={() => router.push('/(app)/more/accommodation')}
            testID="more-row-learning-preferences"
          />
          <SettingsRow
            label={t('more.mentorMemory.sectionHeader')}
            onPress={() => router.push('/(app)/mentor-memory?returnTo=more')}
            testID="more-row-mentor-memory"
          />
          <SettingsRow
            label={t('more.account.mentorLanguage')}
            onPress={() => router.push('/(app)/more/account')}
            testID="more-row-mentor-language"
          />
        </View>

        <View className="mt-4 gap-2">
          <SettingsRow
            label={t('more.account.profile')}
            onPress={() => router.push('/(app)/more/account')}
            testID="more-row-account"
          />
          <SettingsRow
            label={t('more.notifications.sectionHeader')}
            onPress={() => router.push('/(app)/more/notifications')}
            testID="more-row-notifications"
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
                  clerkUserId: userId ?? undefined,
                });
              } catch (err) {
                // [BUG-771] If clerkSignOut hung past CLERK_SIGNOUT_TIMEOUT_MS
                // the local state is already wiped (cache/SecureStore/Sentry
                // scope all run BEFORE the timed-out Clerk call). Force the
                // user to /sign-in instead of leaving them on the More
                // screen — staying here would let them keep tapping buttons
                // against a half-signed-out app. The breadcrumb +
                // captureMessage emitted by sign-out.ts already make this
                // observable; no console.warn-only fallback per AGENTS.md
                // "Silent recovery without escalation is banned".
                if (err instanceof ClerkSignOutTimeoutError) {
                  router.replace('/sign-in');
                  return;
                }
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
