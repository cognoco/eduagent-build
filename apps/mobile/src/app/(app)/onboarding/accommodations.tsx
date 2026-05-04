import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AccommodationMode } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdateAccommodationMode } from '../../../hooks/use-learner-profile';
import { ACCOMMODATION_OPTIONS } from '../../../lib/accommodation-options';
import { classifyApiError } from '../../../lib/format-api-error';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import { ErrorFallback } from '../../../components/common/ErrorFallback';

export default function AccommodationsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    subjectId,
    subjectName,
    languageCode,
    languageName,
    step: stepParam,
    totalSteps: totalStepsParam,
  } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    languageCode?: string;
    languageName?: string;
    step?: string;
    totalSteps?: string;
  }>();
  const step = Number(stepParam) || 3;
  const totalSteps = Number(totalStepsParam) || 4;
  const [selectedMode, setSelectedMode] = useState<AccommodationMode>('none');
  const updateAccommodation = useUpdateAccommodationMode();

  const navigateToCurriculum = useCallback(() => {
    router.replace({
      pathname: '/(app)/onboarding/curriculum-review',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        languageCode: languageCode ?? '',
        languageName: languageName ?? '',
        step: String(Math.min(step + 1, totalSteps)),
        totalSteps: String(totalSteps),
      },
    } as never);
  }, [
    languageCode,
    languageName,
    router,
    step,
    subjectId,
    subjectName,
    totalSteps,
  ]);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, {
      pathname: languageCode
        ? '/(app)/onboarding/language-setup'
        : '/(app)/onboarding/analogy-preference',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        languageCode: languageCode ?? '',
        languageName: languageName ?? '',
        step: '2',
        totalSteps: String(totalSteps),
      },
    });
  }, [languageCode, languageName, router, subjectId, subjectName, totalSteps]);

  const handleContinue = useCallback(() => {
    if (selectedMode === 'none') {
      navigateToCurriculum();
      return;
    }

    updateAccommodation.mutate(
      { accommodationMode: selectedMode },
      {
        onSuccess: navigateToCurriculum,
        onError: (err) => {
          // UX-DE-M12: preserve server message via classifyApiError
          platformAlert(
            t('onboarding.accommodations.saveErrorTitle'),
            classifyApiError(err).message
          );
        },
      }
    );
  }, [navigateToCurriculum, selectedMode, updateAccommodation]);

  if (!subjectId) {
    // [BUG-921] This screen is normally entered from a subject's onboarding
    // flow. Direct-URL or stale-deep-link arrivals land here with no
    // subjectId param and previously hit a terse "No subject selected" +
    // "Go back" dead-end. Per UX Resilience Rules every state needs both
    // an explanation and a forward path — we offer the Library (which is
    // the legitimate way to start a subject's onboarding) plus Go back.
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ErrorFallback
          variant="centered"
          title={t('onboarding.accommodations.noSubjectTitle')}
          message={t('onboarding.accommodations.noSubjectMessage')}
          primaryAction={{
            label: t('onboarding.accommodations.openLibrary'),
            onPress: () => router.replace('/(app)/library' as const),
            testID: 'accommodation-empty-library',
          }}
          secondaryAction={{
            label: t('common.goBack'),
            onPress: () => goBackOrReplace(router, '/(app)/home' as const),
            testID: 'accommodation-empty-back',
          }}
          testID="accommodation-no-subject"
        />
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="px-5 pt-2">
        <Pressable
          testID="accommodation-back"
          onPress={handleBack}
          className="min-h-[44px] min-w-[44px] items-center justify-center self-start"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Text className="text-h2 font-bold text-text-primary mt-4 mb-2">
          {t('onboarding.accommodations.title')}
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          {t('onboarding.accommodations.subtitle')}
        </Text>

        <View className="gap-3">
          {ACCOMMODATION_OPTIONS.map((option) => {
            const isSelected = selectedMode === option.mode;

            return (
              <Pressable
                key={option.mode}
                testID={`accommodation-${option.mode}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                className={`rounded-card border-2 px-4 py-4 ${
                  isSelected
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface-elevated'
                }`}
                onPress={() => setSelectedMode(option.mode)}
              >
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-body font-semibold text-text-primary">
                      {option.title}
                    </Text>
                    <Text className="text-body-sm text-text-secondary mt-1">
                      {option.description}
                    </Text>
                  </View>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={colors.primary}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-5 py-4 gap-3">
        <Pressable
          testID="accommodation-continue"
          className="bg-primary rounded-button py-4 items-center"
          onPress={handleContinue}
          disabled={updateAccommodation.isPending}
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.continue')}
          </Text>
        </Pressable>
        <Pressable
          testID="accommodation-skip"
          className="py-2 items-center"
          onPress={navigateToCurriculum}
        >
          <Text className="text-body text-text-secondary">
            {t('onboarding.common.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
