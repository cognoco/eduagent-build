import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCallback, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ConversationLanguage } from '@eduagent/schemas';

import { useUpdateConversationLanguage } from '../../../hooks/use-onboarding-dimensions';
import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import {
  CONVERSATION_LANGUAGES,
  CONVERSATION_LANGUAGE_LABELS,
  isConversationOnlyLocale,
} from '../../../lib/conversation-languages';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useProfile } from '../../../lib/profile';
import * as SecureStore from '../../../lib/secure-storage';
import { mentorLanguageExplicitOverrideKey } from '../../../lib/secure-store-keys';
import { useThemeColors } from '../../../lib/theme';

// WI-1496 — reads/writes profiles.conversationLanguage (the LLM tutor-prose
// language) via the existing onboarding hook. This screen must NEVER touch
// i18next.language / SUPPORTED_LANGUAGES — that split is intentional (see
// AGENTS.md "Languages"). App-shell UI language stays on the separate
// more/account.tsx "App Language" picker.
export default function MentorLanguageScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { activeProfile, profiles } = useProfile();
  const navigationContract = useNavigationContract();
  const { childProfileId } = useLocalSearchParams<{
    childProfileId?: string;
  }>();
  const isChildMode = !!childProfileId;
  const childProfile = isChildMode
    ? profiles.find((p) => p.id === childProfileId)
    : undefined;
  const canEditChildPreferences =
    isChildMode &&
    navigationContract.gates.showMentorLanguageChildEditor &&
    childProfile?.isOwner === false;

  const targetProfile = canEditChildPreferences ? childProfile : activeProfile;
  const currentLanguage: ConversationLanguage =
    (targetProfile?.conversationLanguage as ConversationLanguage | undefined) ??
    'en';

  const updateConversationLanguage = useUpdateConversationLanguage();

  useEffect(() => {
    if (!activeProfile) return;
    if (isChildMode && !canEditChildPreferences) {
      router.replace('/(app)/more' as Href);
    }
  }, [activeProfile, canEditChildPreferences, isChildMode, router]);

  const fallbackHref =
    canEditChildPreferences && childProfileId
      ? (`/(app)/child/${childProfileId}?mode=settings` as Href)
      : ('/(app)/more/account' as Href);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, fallbackHref);
  }, [fallbackHref, router]);

  const handleSelectLanguage = useCallback(
    (lang: ConversationLanguage) => {
      if (lang === currentLanguage) return;
      const targetProfileId = targetProfile?.id;
      updateConversationLanguage.mutate(
        {
          conversationLanguage: lang,
          childProfileId:
            canEditChildPreferences && childProfileId
              ? childProfileId
              : undefined,
        },
        {
          onSuccess: async () => {
            if (!targetProfileId) return;
            const markerKey =
              mentorLanguageExplicitOverrideKey(targetProfileId);
            await SecureStore.setItemAsync(markerKey, 'true');
          },
          onError: () => {
            platformAlert(
              t('more.errors.couldNotSaveSetting'),
              t('more.errors.tryAgain'),
            );
          },
        },
      );
    },
    [
      canEditChildPreferences,
      childProfileId,
      currentLanguage,
      t,
      targetProfile?.id,
      updateConversationLanguage,
    ],
  );

  if (isChildMode && !canEditChildPreferences) {
    return (
      <View
        className="flex-1 bg-background"
        testID="mentor-language-access-pending"
      />
    );
  }

  const title = canEditChildPreferences
    ? t('more.mentorLanguage.childScreenTitle', {
        name: childProfile?.displayName,
      })
    : t('more.mentorLanguage.screenTitle');

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={handleBack}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          testID="mentor-language-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text
          className="text-h2 font-bold text-text-primary flex-1"
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        testID="mentor-language-scroll"
      >
        <Text className="text-body-sm text-text-secondary mb-4">
          {t('more.mentorLanguage.screenDescription')}
        </Text>
        {CONVERSATION_LANGUAGES.map((lang) => {
          const selected = lang === currentLanguage;
          const conversationOnly = isConversationOnlyLocale(lang);
          return (
            <Pressable
              key={lang}
              onPress={() => handleSelectLanguage(lang)}
              disabled={updateConversationLanguage.isPending}
              className={`px-4 py-3.5 rounded-xl mb-2 ${
                selected ? 'bg-primary/10 border border-primary' : 'bg-surface'
              }`}
              testID={`mentor-language-option-${lang}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-body font-medium text-text-primary">
                    {CONVERSATION_LANGUAGE_LABELS[lang].native}
                  </Text>
                  <Text className="text-body-sm text-text-secondary">
                    {CONVERSATION_LANGUAGE_LABELS[lang].english}
                  </Text>
                </View>
                {selected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.primary}
                  />
                ) : null}
              </View>
              {conversationOnly ? (
                <Text
                  className="text-caption text-text-secondary mt-1"
                  testID={`mentor-language-hint-${lang}`}
                >
                  {t('more.mentorLanguage.conversationOnlyHint', {
                    language: CONVERSATION_LANGUAGE_LABELS[lang].english,
                  })}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
