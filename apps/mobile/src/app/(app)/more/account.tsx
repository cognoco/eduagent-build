import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AccountSecurity } from '../../../components/account-security';
import {
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';
import { useActiveProfileRole } from '../../../hooks/use-active-profile-role';
import {
  i18next,
  LANGUAGE_LABELS,
  setStoredLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../../../i18n';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { platformAlert } from '../../../lib/platform-alert';
import { useProfile } from '../../../lib/profile';
import { useThemeColors } from '../../../lib/theme';
import { useSubscription } from '../../../hooks/use-subscription';

export default function AccountScreen(): React.ReactElement {
  const router = useRouter();
  const themeColors = useThemeColors();
  const { user } = useUser();
  const { activeProfile } = useProfile();
  const role = useActiveProfileRole();
  const { data: subscription } = useSubscription();
  const { t } = useTranslation();
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const currentLanguage = i18next.language as SupportedLanguage;
  const displayName =
    activeProfile?.displayName ??
    user?.fullName ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    'User';

  const handleLanguageChange = useCallback(
    async (lang: SupportedLanguage) => {
      try {
        await setStoredLanguage(lang);
        await i18next.changeLanguage(lang);
        setShowLanguagePicker(false);
      } catch (err) {
        console.warn('[more/account] language change failed:', err);
        platformAlert(
          t('settings.languageChangeFailedTitle'),
          t('settings.languageChangeFailedMessage'),
          [{ text: t('common.ok') }],
        );
      }
    },
    [t],
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        testID="more-account-scroll"
      >
        <SectionHeader>{t('more.account.sectionHeader')}</SectionHeader>
        <SettingsRow
          label={t('more.account.profile')}
          value={displayName}
          onPress={() => router.push('/profiles')}
          testID="more-row-profile"
        />
        <AccountSecurity visible={activeProfile?.isOwner ?? false} />
        {FEATURE_FLAGS.I18N_ENABLED ? (
          <SettingsRow
            label={t('settings.appLanguage')}
            value={LANGUAGE_LABELS[currentLanguage]?.native}
            onPress={() => setShowLanguagePicker(true)}
            testID="settings-app-language"
          />
        ) : null}
        {role === 'owner' ? (
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
        ) : null}
      </ScrollView>
      {FEATURE_FLAGS.I18N_ENABLED ? (
        <Modal
          visible={showLanguagePicker}
          animationType="slide"
          transparent
          onRequestClose={() => setShowLanguagePicker(false)}
        >
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
                    {lang === currentLanguage ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={themeColors.primary}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}
