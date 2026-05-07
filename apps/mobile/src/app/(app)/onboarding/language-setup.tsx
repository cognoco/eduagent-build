import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLocales } from 'expo-localization';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { CefrLevel } from '@eduagent/schemas';
import { useConfigureLanguageSubject } from '../../../hooks/use-subjects';
import { useStartFirstCurriculumSession } from '../../../hooks/use-sessions';
import { formatApiError } from '../../../lib/format-api-error';
import { useThemeColors } from '../../../lib/theme';
import { goBackOrReplace } from '../../../lib/navigation';

const NATIVE_LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'nb', label: 'Norwegian' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'ro', label: 'Romanian' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'other', label: 'Other' },
];

const NATIVE_LANGUAGE_CODES = new Set(
  NATIVE_LANGUAGE_OPTIONS.map((o) => o.code).filter((c) => c !== 'other')
);

/** Derive a pre-selected native language from the device locale.
 *  Returns the matching NATIVE_LANGUAGE_CODES entry, or 'en' as fallback.
 */
function getDeviceNativeLanguage(): string {
  try {
    const tag = getLocales()[0]?.languageTag ?? 'en';
    const lang = tag.split('-')[0] ?? 'en';
    // nb-NO → 'nb', nn-NO → try 'nb' (Norwegian Nynorsk → Bokmål)
    if (NATIVE_LANGUAGE_CODES.has(lang)) return lang;
    // Norwegian Nynorsk maps to Norwegian Bokmål in the option list
    if (lang === 'nn') return 'nb';
  } catch {
    // getLocales() can throw in test environments
  }
  return 'en';
}

const LEVEL_OPTIONS: Array<{
  label: string;
  level: CefrLevel;
  description: string;
  testId: string;
}> = [
  {
    label: 'Complete beginner',
    level: 'A1',
    description: 'Start from the foundations and build everyday basics.',
    testId: 'level-beginner',
  },
  {
    label: 'I know some basics',
    level: 'A2',
    description: 'You can handle simple situations and want to grow range.',
    testId: 'level-some-basics',
  },
  {
    label: 'Conversational',
    level: 'B1',
    description: 'You can get by and want stronger fluency and precision.',
    testId: 'level-conversational',
  },
  {
    label: 'Advanced',
    level: 'B2',
    description: 'You want more nuance, confidence, and flexible expression.',
    testId: 'level-advanced',
  },
];

export default function LanguageSetup() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subjectId, subjectName, languageName, returnTo } =
    useLocalSearchParams<{
      subjectId?: string;
      subjectName?: string;
      languageName?: string;
      returnTo?: string;
    }>();
  const configureLanguageSubject = useConfigureLanguageSubject();
  const startFirstCurriculumSession = useStartFirstCurriculumSession(
    subjectId ?? ''
  );
  const colors = useThemeColors(); // [BUG-118]
  const [nativeLanguage, setNativeLanguage] = useState<string>(() =>
    getDeviceNativeLanguage()
  );
  const [customLanguage, setCustomLanguage] = useState('');
  const [startingLevel, setStartingLevel] = useState<CefrLevel>('A1');
  const [error, setError] = useState('');
  // BUG-692-FOLLOWUP: Guard post-await router.replace against the user having
  // pressed Back while configureLanguageSubject.mutateAsync was in flight.
  const cancelledRef = useRef(false);

  const safeLanguageName = useMemo(
    () => languageName?.trim() || 'this language',
    [languageName]
  );

  const effectiveNativeLanguage =
    nativeLanguage === 'other' ? customLanguage.trim() : nativeLanguage;

  const handleBack = useCallback(() => {
    // BUG-692-FOLLOWUP: Mark the mutation as cancelled so the post-await
    // router.replace in handleContinue does not fire after back-navigation.
    cancelledRef.current = true;
    if (returnTo === 'settings') {
      goBackOrReplace(router, '/(app)/more' as Href);
      return;
    }
    goBackOrReplace(router, '/(app)/home' as Href);
  }, [returnTo, router]);

  const handleContinue = async () => {
    if (!subjectId) return;
    if (nativeLanguage === 'other' && customLanguage.trim().length < 2) {
      setError(t('onboarding.languageSetup.nativeLanguageRequired'));
      return;
    }
    setError('');
    // BUG-692-FOLLOWUP: Reset the cancellation flag at the start of each attempt
    // so a prior back-navigation doesn't permanently suppress the next attempt.
    cancelledRef.current = false;
    try {
      await configureLanguageSubject.mutateAsync({
        subjectId,
        nativeLanguage: effectiveNativeLanguage,
        startingLevel,
      });
      // BUG-692-FOLLOWUP: User pressed Back while the mutation was in flight —
      // don't navigate to session from a screen the user has already left.
      if (cancelledRef.current) return;
      // ACCOUNT-29: Settings re-entry saves and routes back to More.
      if (returnTo === 'settings') {
        goBackOrReplace(router, '/(app)/more' as Href);
        return;
      }
      const result = await startFirstCurriculumSession.mutateAsync({
        sessionType: 'learning',
        inputMode: 'text',
      });
      if (cancelledRef.current) return;
      router.replace({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId,
          sessionId: result.session.id,
          topicId: result.session.topicId ?? undefined,
          subjectName: subjectName ?? languageName ?? '',
        },
      } as never);
    } catch (err: unknown) {
      // BUG-692-FOLLOWUP: Don't surface error if user already navigated away.
      if (cancelledRef.current) return;
      setError(formatApiError(err));
    }
  };

  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-5">
        <Text className="text-text-secondary mb-4">
          {t('onboarding.languageSetup.noSubjectSelected')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="bg-primary rounded-button px-6 py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goHome')}
          testID="language-setup-guard-home"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.goHome')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={handleBack}
          className="mb-3 min-w-[44px] min-h-[44px] justify-center self-start"
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
          testID="language-setup-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text
          className="text-h2 font-bold text-text-primary"
          testID="language-setup-calibration-title"
        >
          {t('onboarding.languageSetup.calibrationTitle')}
        </Text>
        <Text className="text-body text-text-secondary mt-2 mb-5">
          {t('onboarding.languageSetup.calibrationSubtitle')}
        </Text>

        <View className="bg-primary/10 rounded-card p-4 mb-6">
          <Text className="text-body font-semibold text-text-primary">
            {t('onboarding.languageSetup.learningHint', {
              language: safeLanguageName,
            })}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-2">
            {t('onboarding.languageSetup.approachHint')}
          </Text>
        </View>

        {error !== '' && (
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
            <Text className="text-danger text-body-sm">{error}</Text>
            <View className="flex-row gap-3 mt-3">
              <Pressable
                onPress={() => void handleContinue()}
                className="bg-primary rounded-button px-4 py-2.5 items-center flex-1 min-h-[44px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('common.tryAgain')}
                testID="language-setup-error-retry"
              >
                <Text className="text-text-inverse text-body-sm font-semibold">
                  {t('common.tryAgain')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => goBackOrReplace(router, '/(app)/home')}
                className="bg-surface rounded-button px-4 py-2.5 items-center flex-1 min-h-[44px] justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                testID="language-setup-error-cancel"
              >
                <Text className="text-text-primary text-body-sm font-semibold">
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text className="text-body font-semibold text-text-primary mb-3">
          {t('onboarding.languageSetup.nativeLanguageLabel')}
        </Text>
        <View className="gap-2 mb-6">
          {NATIVE_LANGUAGE_OPTIONS.map((option) => {
            const selected = nativeLanguage === option.code;
            return (
              <View key={option.code} className="gap-2">
                <Pressable
                  onPress={() => setNativeLanguage(option.code)}
                  className={
                    selected
                      ? 'rounded-card border border-primary bg-primary/10 px-4 py-3'
                      : 'rounded-card border border-border bg-surface px-4 py-3'
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`native-language-${option.code}`}
                >
                  <Text
                    className="text-body font-semibold text-text-primary"
                    testID={
                      selected
                        ? `native-language-selected-${option.code}`
                        : undefined
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
                {option.code === 'other' && selected && (
                  <TextInput
                    value={customLanguage}
                    onChangeText={setCustomLanguage}
                    placeholder={t(
                      'onboarding.languageSetup.nativeLanguagePlaceholder'
                    )}
                    placeholderTextColor={colors.textSecondary}
                    className="rounded-card border border-primary bg-surface px-4 py-3 text-body text-text-primary"
                    autoFocus
                    testID="native-language-other-input"
                  />
                )}
              </View>
            );
          })}
        </View>

        <Text className="text-body font-semibold text-text-primary mb-3">
          {t('onboarding.languageSetup.currentLevelLabel')}
        </Text>
        <View className="gap-3">
          {LEVEL_OPTIONS.map((option) => {
            const selected = startingLevel === option.level;
            return (
              <Pressable
                key={option.label}
                onPress={() => setStartingLevel(option.level)}
                className={
                  selected
                    ? 'rounded-card border border-primary bg-primary/10 px-4 py-4'
                    : 'rounded-card border border-border bg-surface px-4 py-4'
                }
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={option.testId}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {t(`onboarding.languageSetup.levels.${option.level}.label`)}
                </Text>
                <Text className="text-caption text-text-secondary mt-1">
                  {t('onboarding.languageSetup.startsAround', {
                    level: option.level,
                  })}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-2">
                  {t(
                    `onboarding.languageSetup.levels.${option.level}.description`
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => void handleContinue()}
          disabled={configureLanguageSubject.isPending}
          className="bg-primary rounded-button py-3.5 items-center mt-8"
          testID="language-setup-continue"
        >
          {configureLanguageSubject.isPending ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text className="text-text-inverse text-body font-semibold">
              {t('common.continue')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}
