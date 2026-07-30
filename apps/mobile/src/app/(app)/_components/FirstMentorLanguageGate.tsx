import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useClerk, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationLanguage } from '@eduagent/schemas';

import { useUpdateConversationLanguage } from '../../../hooks/use-onboarding-dimensions';
import {
  CONVERSATION_LANGUAGES,
  CONVERSATION_LANGUAGE_LABELS,
  isConversationOnlyLocale,
} from '../../../lib/conversation-languages';
import { beginExplicitMentorLanguageUpdate } from '../../../lib/mentor-language-coordination';
import { platformAlert } from '../../../lib/platform-alert';
import { useProfile } from '../../../lib/profile';
import { signOutWithCleanup } from '../../../lib/sign-out';
import { useThemeColors } from '../../../lib/theme';

export function FirstMentorLanguageGate(): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { activeProfile, profiles } = useProfile();
  const updateLanguage = useUpdateConversationLanguage();
  const persistedLanguage =
    (activeProfile?.conversationLanguage as ConversationLanguage | undefined) ??
    'en';
  const [selectedLanguage, setSelectedLanguage] =
    React.useState<ConversationLanguage>(persistedLanguage);
  const [saveFailed, setSaveFailed] = React.useState(false);

  React.useEffect(() => {
    setSelectedLanguage(persistedLanguage);
  }, [activeProfile?.id, persistedLanguage]);

  const confirm = React.useCallback(() => {
    if (!activeProfile) return;
    setSaveFailed(false);
    const languageOperation = beginExplicitMentorLanguageUpdate(
      activeProfile.id,
    );
    updateLanguage.mutate(
      {
        conversationLanguage: selectedLanguage,
        languageOperation,
        confirmFirstMentorLanguage: true,
      },
      {
        onError: () => setSaveFailed(true),
      },
    );
  }, [activeProfile, selectedLanguage, updateLanguage]);

  const handleSignOut = async () => {
    try {
      await signOutWithCleanup({
        clerkSignOut: signOut,
        queryClient,
        profileIds: profiles.map((profile) => profile.id),
        clerkUserId: user?.id,
      });
    } catch (err: unknown) {
      console.error('signOut failed:', err);
      platformAlert(
        t('tabs.createProfile.signOutFailedTitle'),
        t('tabs.createProfile.signOutFailedMessage'),
      );
    }
  };

  return (
    <View className="flex-1 bg-background" testID="first-mentor-language-gate">
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        testID="first-mentor-language-scroll"
      >
        <Text
          className="text-h1 font-bold text-text-primary mb-2"
          accessibilityRole="header"
        >
          {t('more.mentorLanguage.screenTitle')}
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          {t('more.mentorLanguage.screenDescription')}
        </Text>

        {CONVERSATION_LANGUAGES.map((language) => {
          const selected = language === selectedLanguage;
          return (
            <Pressable
              key={language}
              onPress={() => {
                setSaveFailed(false);
                setSelectedLanguage(language);
              }}
              disabled={updateLanguage.isPending}
              className={`px-4 py-3.5 rounded-xl mb-2 ${
                selected ? 'bg-primary/10 border border-primary' : 'bg-surface'
              }`}
              testID={`first-mentor-language-option-${language}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-body font-medium text-text-primary">
                    {CONVERSATION_LANGUAGE_LABELS[language].native}
                  </Text>
                  <Text className="text-body-sm text-text-secondary">
                    {CONVERSATION_LANGUAGE_LABELS[language].english}
                  </Text>
                </View>
              </View>
              {isConversationOnlyLocale(language) ? (
                <Text className="text-caption text-text-secondary mt-1">
                  {t('more.mentorLanguage.conversationOnlyHint', {
                    language: CONVERSATION_LANGUAGE_LABELS[language].english,
                  })}
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        {saveFailed ? (
          <Text
            className="text-body-sm text-danger mt-2"
            testID="first-mentor-language-error"
          >
            {t('more.errors.tryAgain')}
          </Text>
        ) : null}

        <Pressable
          onPress={confirm}
          disabled={updateLanguage.isPending}
          className={`rounded-button py-3.5 items-center mt-4 ${
            updateLanguage.isPending ? 'bg-primary/40' : 'bg-primary'
          }`}
          testID="first-mentor-language-confirm"
          accessibilityRole="button"
          accessibilityState={{ disabled: updateLanguage.isPending }}
        >
          {updateLanguage.isPending ? (
            <ActivityIndicator
              color={colors.textInverse}
              accessibilityLabel={t('common.loading')}
            />
          ) : (
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.continue')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => void handleSignOut()}
          className="py-3.5 items-center mt-3"
          testID="first-mentor-language-sign-out"
          accessibilityRole="button"
          accessibilityLabel={t('common.signOut')}
        >
          <Text className="text-body font-semibold text-primary">
            {t('common.signOut')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
