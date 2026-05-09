import {
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Linking,
  Share,
  Modal,
} from 'react-native';
import { useState, useCallback } from 'react';
import { platformAlert } from '../../lib/platform-alert';
import { clearTransitionState } from '../../lib/auth-transition';
import { clearProfileSecureStorageOnSignOut } from '../../lib/sign-out-cleanup';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import type { AccommodationMode, KnowledgeInventory } from '@eduagent/schemas';
import { useProfile } from '../../lib/profile';
import { useActiveProfileRole } from '../../hooks/use-active-profile-role';
import { useQueryClient } from '@tanstack/react-query';
import { isNewLearner } from '../../lib/progressive-disclosure';
import { useExportData } from '../../hooks/use-account';
import {
  useLearnerProfile,
  useUpdateAccommodationMode,
} from '../../hooks/use-learner-profile';
import { useFamilySubscription } from '../../hooks/use-subscription';
import { AccountSecurity } from '../../components/account-security';
import { useFeedbackContext } from '../../components/feedback/FeedbackProvider';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
  useCelebrationLevel,
  useUpdateCelebrationLevel,
  useWithdrawalArchivePreference,
  useUpdateWithdrawalArchivePreference,
} from '../../hooks/use-settings';
import { useSubscription } from '../../hooks/use-subscription';
import { ACCOMMODATION_OPTIONS } from '../../lib/accommodation-options';
import { formatApiError } from '../../lib/format-api-error';
import { track } from '../../lib/analytics';
import { FAMILY_HOME_PATH } from '../../lib/navigation';
import { useTranslation } from 'react-i18next';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import {
  i18next,
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  setStoredLanguage,
  type SupportedLanguage,
} from '../../i18n';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../../lib/theme';

function SettingsRow({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
      style={({ pressed }) => ({
        ...(pressed ? { opacity: 0.6 } : {}),
        ...(Platform.OS === 'web' && onPress ? { cursor: 'pointer' } : {}),
      })}
      accessibilityLabel={label}
      accessibilityRole="button"
      testID={testID}
    >
      <Text className="text-body text-text-primary">{label}</Text>
      {value && (
        <Text className="text-body-sm text-text-secondary">{value}</Text>
      )}
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  disabled,
  testID,
  description,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
  description?: string;
}) {
  return (
    <View
      className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3 mb-2"
      testID={testID}
    >
      <View className="flex-1 pr-3">
        <Text className="text-body text-text-primary">{label}</Text>
        {description ? (
          <Text className="text-body-sm text-text-secondary mt-1">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        accessibilityLabel={label}
        testID={testID ? `${testID}-switch` : undefined}
      />
    </View>
  );
}

function LearningModeOption({
  title,
  description,
  selected,
  disabled,
  onPress,
  testID,
}: {
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`bg-surface rounded-card px-4 py-3.5 mb-2 ${
        selected ? 'border-2 border-primary' : 'border-2 border-transparent'
      }`}
      accessibilityLabel={`${title}: ${description}`}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      testID={testID}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-body font-semibold text-text-primary">
          {title}
        </Text>
        {selected && (
          <Text className="text-primary text-body font-semibold">
            {t('more.active')}
          </Text>
        )}
      </View>
      <Text className="text-body-sm text-text-secondary mt-1">
        {description}
      </Text>
    </Pressable>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const themeColors = useThemeColors();
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
  const exportData = useExportData();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: subscription } = useSubscription();
  const { data: familyData } = useFamilySubscription(
    subscription?.tier === 'family' || subscription?.tier === 'pro',
  );
  const { data: notifPrefs, isLoading: notifLoading } =
    useNotificationSettings();
  const updateNotifications = useUpdateNotificationSettings();
  const { data: celebrationLevel, isLoading: celebrationLoading } =
    useCelebrationLevel();
  const updateCelebrationLevel = useUpdateCelebrationLevel();
  const { data: withdrawalArchivePreference, isLoading: archivePrefLoading } =
    useWithdrawalArchivePreference();
  const updateWithdrawalArchivePreference =
    useUpdateWithdrawalArchivePreference();
  const {
    data: learnerProfile,
    isError: learnerProfileError,
    refetch: refetchLearnerProfile,
  } = useLearnerProfile();
  const updateAccommodation = useUpdateAccommodationMode();
  const { openFeedback } = useFeedbackContext();
  const { t } = useTranslation();

  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const currentLanguage = i18next.language as SupportedLanguage;

  const handleLanguageChange = useCallback(
    async (lang: SupportedLanguage) => {
      try {
        await setStoredLanguage(lang);
        await i18next.changeLanguage(lang);
        setShowLanguagePicker(false);
      } catch (err) {
        console.warn('[more] language change failed:', err);
        platformAlert(
          t('settings.languageChangeFailedTitle'),
          t('settings.languageChangeFailedMessage'),
          [{ text: t('common.ok') }],
        );
      }
    },
    [t],
  );

  const pushEnabled = notifPrefs?.pushEnabled ?? false;
  const weeklyDigest = notifPrefs?.weeklyProgressPush ?? false;
  const withdrawalArchiveOptions = [
    {
      value: 'auto',
      title: t('more.privacy.withdrawalArchiveAuto'),
      description: t('more.privacy.withdrawalArchiveAutoDescription'),
    },
    {
      value: 'always',
      title: t('more.privacy.withdrawalArchiveAlways'),
      description: t('more.privacy.withdrawalArchiveAlwaysDescription'),
    },
    {
      value: 'never',
      title: t('more.privacy.withdrawalArchiveNever'),
      description: t('more.privacy.withdrawalArchiveNeverDescription'),
    },
  ] as const;

  const handleTogglePush = useCallback(
    (value: boolean) => {
      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs?.reviewReminders ?? false,
          dailyReminders: notifPrefs?.dailyReminders ?? false,
          weeklyProgressPush: notifPrefs?.weeklyProgressPush ?? true,
          pushEnabled: value,
        },
        {
          onError: () => {
            platformAlert(
              t('more.notifications.updateErrorTitle'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [updateNotifications, notifPrefs, t],
  );

  const handleToggleDigest = useCallback(
    (value: boolean) => {
      updateNotifications.mutate(
        {
          reviewReminders: notifPrefs?.reviewReminders ?? false,
          dailyReminders: notifPrefs?.dailyReminders ?? false,
          weeklyProgressPush: value,
          pushEnabled: notifPrefs?.pushEnabled ?? false,
        },
        {
          onError: () => {
            platformAlert(
              t('more.notifications.updateErrorTitle'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [updateNotifications, notifPrefs, t],
  );

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

  const handleExport = useCallback(async () => {
    try {
      const data = await exportData.mutateAsync();
      const jsonString = JSON.stringify(data, null, 2);

      if (Platform.OS === 'web') {
        // [BUG-509] Web Share API is not universally supported — file download instead
        // Use globalThis casts to avoid DOM-lib requirement in RN tsconfig.
        type WebDoc = {
          createElement(tag: string): {
            href: string;
            download: string;
            click(): void;
          };
        };
        const doc = (globalThis as { document?: WebDoc }).document;
        if (!doc) return;
        // RN globals.d.ts requires both `type` and `lastModified` in BlobOptions.
        const blob = new Blob([jsonString], {
          type: 'application/json',
          lastModified: Date.now(),
        });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = 'mentomate-data-export.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const result = await Share.share({
          title: t('more.export.shareTitle'),
          message: jsonString,
        });
        // [UX-DE-L4] iOS returns dismissedAction when the user cancels the
        // share sheet — treat it as a no-op, not a success or error.
        if (result.action === Share.dismissedAction) {
          return;
        }
      }
    } catch (err: unknown) {
      platformAlert(t('more.export.errorTitle'), formatApiError(err));
    }
  }, [exportData, t]);

  const handleHelp = useCallback(async () => {
    try {
      await Linking.openURL(
        'mailto:support@mentomate.app?subject=MentoMate%20Support',
      );
    } catch {
      platformAlert(
        t('more.help.contactSupportTitle'),
        t('more.help.contactSupportMessage'),
      );
    }
  }, [t]);

  const handleAddChild = useCallback(() => {
    if (!subscription) {
      // Query still loading — don't block with a false 'Upgrade required'
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

  const handleChildProgressNavigation = useCallback(
    (href: string) => {
      track('child_progress_navigated', { source: 'more_section' });
      router.push(href as never);
    },
    [router],
  );

  const linkedChildren = activeProfile?.isOwner
    ? profiles.filter((p) => p.id !== activeProfile.id && !p.isOwner)
    : [];
  const isFamilyCapablePlan =
    subscription?.tier === 'family' || subscription?.tier === 'pro';
  const showFamilyOnboarding =
    activeProfile?.isOwner === true &&
    linkedChildren.length === 0 &&
    isFamilyCapablePlan;

  const displayName =
    activeProfile?.displayName ??
    user?.fullName ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    'User';

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
            onPress={() =>
              handleChildProgressNavigation(
                `/(app)/child/${linkedChildren[0]?.id ?? ''}`,
              )
            }
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
                testID="accommodation-mode-retry"
              >
                <Text className="text-caption font-semibold text-primary">
                  {t('common.retry')}
                </Text>
              </Pressable>
            ) : null}
            {ACCOMMODATION_OPTIONS.map((opt) => (
              <LearningModeOption
                key={opt.mode}
                title={opt.title}
                description={opt.description}
                selected={learnerProfile.accommodationMode === opt.mode}
                disabled={updateAccommodation.isPending}
                onPress={() => handleSelectAccommodation(opt.mode)}
                testID={`accommodation-mode-${opt.mode}`}
              />
            ))}
          </>
        )}

        {/* 3. What My Mentor Knows — shown after learning prefs, hidden for new learners */}
        {!hideMentorMemory ? (
          <>
            <Text
              className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6"
              testID="mentor-memory-section-header"
            >
              {t('more.mentorMemory.sectionHeader')}
            </Text>
            <SettingsRow
              label={t('more.mentorMemory.viewAndManage')}
              onPress={() => router.push('/(app)/mentor-memory?returnTo=more')}
              testID="mentor-memory-link"
            />
          </>
        ) : null}

        {/* 4. Family onboarding — the Family tab owns family management once children exist. */}
        {showFamilyOnboarding && (
          <>
            <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
              {t('more.family.sectionHeader')}
            </Text>
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
        )}

        {/* 5. Celebrations */}
        <Text
          className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6"
          testID="celebrations-section-header"
        >
          {t('more.celebrations.sectionHeader')}
        </Text>
        <LearningModeOption
          title={t('more.celebrations.allTitle')}
          description={t('more.celebrations.allDescription')}
          selected={celebrationLevel === 'all'}
          disabled={celebrationLoading || updateCelebrationLevel.isPending}
          onPress={() => {
            if (celebrationLevel !== 'all') {
              updateCelebrationLevel.mutate('all', {
                onError: () => {
                  platformAlert(
                    t('more.errors.couldNotSaveSetting'),
                    t('more.errors.tryAgain'),
                  );
                },
              });
            }
          }}
          testID="celebration-level-all"
        />
        <LearningModeOption
          title={t('more.celebrations.bigOnlyTitle')}
          description={t('more.celebrations.bigOnlyDescription')}
          selected={celebrationLevel === 'big_only'}
          disabled={celebrationLoading || updateCelebrationLevel.isPending}
          onPress={() => {
            if (celebrationLevel !== 'big_only') {
              updateCelebrationLevel.mutate('big_only', {
                onError: () => {
                  platformAlert(
                    t('more.errors.couldNotSaveSetting'),
                    t('more.errors.tryAgain'),
                  );
                },
              });
            }
          }}
          testID="celebration-level-big-only"
        />
        <LearningModeOption
          title={t('more.celebrations.offTitle')}
          description={t('more.celebrations.offDescription')}
          selected={celebrationLevel === 'off'}
          disabled={celebrationLoading || updateCelebrationLevel.isPending}
          onPress={() => {
            if (celebrationLevel !== 'off') {
              updateCelebrationLevel.mutate('off', {
                onError: () => {
                  platformAlert(
                    t('more.errors.couldNotSaveSetting'),
                    t('more.errors.tryAgain'),
                  );
                },
              });
            }
          }}
          testID="celebration-level-off"
        />

        {/* 6. Notifications */}
        <Text
          className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6"
          testID="notifications-section-header"
        >
          {t('more.notifications.sectionHeader')}
        </Text>
        <ToggleRow
          label={t('more.notifications.pushTitle')}
          value={pushEnabled}
          onToggle={handleTogglePush}
          disabled={notifLoading || updateNotifications.isPending}
          testID="push-notifications-toggle"
        />
        <ToggleRow
          label={t('more.notifications.weeklyDigestTitle')}
          value={weeklyDigest}
          onToggle={handleToggleDigest}
          disabled={notifLoading || updateNotifications.isPending}
          testID="weekly-digest-toggle"
        />

        {/* 7. Privacy */}
        {activeProfile?.isOwner ? (
          <>
            <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
              {t('more.privacy.sectionHeader')}
            </Text>
            <Text className="text-body font-semibold text-text-primary mb-2">
              {t('more.privacy.withdrawalArchiveTitle')}
            </Text>
            {withdrawalArchiveOptions.map((opt) => (
              <LearningModeOption
                key={opt.value}
                title={opt.title}
                description={opt.description}
                selected={withdrawalArchivePreference === opt.value}
                disabled={
                  archivePrefLoading ||
                  updateWithdrawalArchivePreference.isPending
                }
                onPress={() => {
                  if (withdrawalArchivePreference === opt.value) return;
                  updateWithdrawalArchivePreference.mutate(opt.value, {
                    onError: () => {
                      platformAlert(
                        t('more.errors.couldNotSaveSetting'),
                        t('more.privacy.withdrawalArchiveError'),
                      );
                    },
                  });
                }}
                testID={`more-withdrawal-archive-${opt.value}`}
              />
            ))}
          </>
        ) : null}

        {/* 8. Account — identity, language, subscription only */}
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
          {t('more.account.sectionHeader')}
        </Text>
        <SettingsRow
          label={t('more.account.profile')}
          value={displayName}
          onPress={() => router.push('/profiles')}
        />
        <AccountSecurity visible={activeProfile?.isOwner ?? false} />
        {FEATURE_FLAGS.I18N_ENABLED && (
          <SettingsRow
            label={t('settings.appLanguage')}
            value={LANGUAGE_LABELS[currentLanguage]?.native}
            onPress={() => setShowLanguagePicker(true)}
            testID="settings-app-language"
          />
        )}
        {FEATURE_FLAGS.I18N_ENABLED && (
          <Modal
            visible={showLanguagePicker}
            animationType="slide"
            transparent
            onRequestClose={() => setShowLanguagePicker(false)}
          >
            {/* Bottom-sheet picker — rendered outside the outer ScrollView so
                row taps don't race the parent scroll on Android (the inline
                Pressable list inside ScrollView pattern routinely lost taps).
                Pressable backdrop dismisses on tap-outside. */}
            <Pressable
              className="flex-1 bg-black/50 justify-end"
              onPress={() => setShowLanguagePicker(false)}
              accessibilityLabel={t('common.close')}
              testID="app-language-backdrop"
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                className="bg-background rounded-t-3xl px-5 pt-4 pb-8"
                style={{ maxHeight: '85%' }}
              >
                <View className="items-center mb-3">
                  <View className="w-12 h-1 bg-text-secondary/30 rounded-full" />
                </View>
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-h3 font-semibold text-text-primary">
                    {t('settings.appLanguage')}
                  </Text>
                  <Pressable
                    onPress={() => setShowLanguagePicker(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                    testID="app-language-close"
                    hitSlop={12}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={themeColors.textSecondary}
                    />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <Pressable
                      key={lang}
                      onPress={() => void handleLanguageChange(lang)}
                      className={`flex-row items-center justify-between p-4 rounded-xl mb-2 ${
                        lang === currentLanguage
                          ? 'bg-primary/10 border border-primary'
                          : 'bg-surface'
                      }`}
                      testID={`language-option-${lang}`}
                    >
                      <View>
                        <Text className="text-body font-medium text-text-primary">
                          {LANGUAGE_LABELS[lang].native}
                        </Text>
                        <Text className="text-body-sm text-text-secondary">
                          {LANGUAGE_LABELS[lang].english}
                        </Text>
                      </View>
                      {lang === currentLanguage && (
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color={themeColors.primary}
                        />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        )}
        {/* [BUG-915] Hide Subscription for child profiles and impersonation —
            billing is the parent account's, not the child profile's.
            C4: also hide for native child profiles (role === 'child'). */}
        {role === 'owner' && (
          <SettingsRow
            label={t('more.account.subscription')}
            value={
              subscription
                ? `${subscription.tier
                    .charAt(0)
                    .toUpperCase()}${subscription.tier.slice(1)}`
                : undefined
            }
            onPress={() => router.push('/(app)/subscription')}
            testID="more-row-subscription"
          />
        )}

        {/* 9. Other — support, legal, data management */}
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-6">
          {t('more.other.sectionHeader')}
        </Text>
        <SettingsRow
          label={t('more.other.helpAndSupport')}
          onPress={() => void handleHelp()}
          testID="more-row-help"
        />
        <SettingsRow
          label={t('more.other.reportAProblem')}
          onPress={openFeedback}
        />
        <SettingsRow
          label={t('more.other.privacyPolicy')}
          onPress={() => router.push('/privacy')}
        />
        <SettingsRow
          label={t('more.other.termsOfService')}
          onPress={() => router.push('/terms')}
        />
        {/* [BUG-915] Hide Export my data and Delete account for child profiles
            and impersonation — both operate on the parent's underlying account.
            C4: also hide for native child profiles (role === 'owner' guard). */}
        {role === 'owner' && (
          <SettingsRow
            label={t('more.other.exportMyData')}
            onPress={exportData.isPending ? undefined : handleExport}
            value={
              exportData.isPending
                ? t('more.export.preparingExport')
                : undefined
            }
            testID="more-row-export"
          />
        )}
        {role === 'owner' && (
          <SettingsRow
            label={t('more.other.deleteAccount')}
            onPress={() => router.push('/delete-account')}
            testID="more-row-delete-account"
          />
        )}

        {/* Homework Help — hidden until parent-controlled toggle is implemented
        <Pressable
          onPress={() => router.push('/(app)/homework/camera')}
          className="bg-surface rounded-card px-4 py-3.5 mb-2 mt-2"
          accessibilityLabel="Start homework help session"
          accessibilityRole="button"
          testID="homework-help-link"
        >
          <Text className="text-body font-semibold text-text-primary">
            Homework Help
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Snap a photo and get guided through it step by step
          </Text>
        </Pressable>
        */}

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
