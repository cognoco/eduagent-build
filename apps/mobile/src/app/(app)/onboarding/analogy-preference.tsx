import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { goBackOrReplace } from '../../../lib/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalogyDomainPicker } from '../../../components/common';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdateAnalogyDomain } from '../../../hooks/use-settings';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';
import type { AnalogyDomain } from '@eduagent/schemas';
import { useCallback, useState } from 'react';

export default function AnalogyPreferenceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const {
    subjectId,
    subjectName,
    step: stepParam,
    totalSteps: totalStepsParam,
  } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    step?: string;
    totalSteps?: string;
  }>();
  const insets = useSafeAreaInsets();
  const step = Number(stepParam) || 2;
  const totalSteps = Number(totalStepsParam) || 4;
  const [selectedDomain, setSelectedDomain] = useState<AnalogyDomain | null>(
    null
  );
  const { mutate: updateAnalogyDomain, isPending } = useUpdateAnalogyDomain(
    subjectId ?? ''
  );

  const handleContinue = (): void => {
    if (selectedDomain) {
      updateAnalogyDomain(selectedDomain, {
        onSuccess: () => {
          navigateToAccommodations();
        },
        onError: (err) => {
          platformAlert(
            t('onboarding.analogyPreference.saveErrorTitle'),
            err instanceof Error ? err.message : t('errors.generic')
          );
        },
      });
    } else {
      navigateToAccommodations();
    }
  };

  const handleSkip = (): void => {
    navigateToAccommodations();
  };

  const navigateToAccommodations = useCallback((): void => {
    router.replace({
      pathname: '/(app)/onboarding/accommodations',
      params: {
        subjectId,
        subjectName: subjectName ?? '',
        step: String(Math.min(step + 1, totalSteps)),
        totalSteps: String(totalSteps),
      },
    } as never);
  }, [router, step, subjectId, subjectName, totalSteps]);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, {
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        step: '1',
        totalSteps: String(totalSteps),
      },
    });
  }, [router, subjectId, subjectName, totalSteps]);

  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-5">
        <Text className="text-text-secondary mb-4">
          {t('onboarding.common.noSubjectSelected')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="bg-primary rounded-button px-6 py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.goHome')}
          testID="analogy-guard-home"
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
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Pressable
          onPress={handleBack}
          className="mb-3 min-w-[44px] min-h-[44px] justify-center self-start"
          accessibilityLabel={t('common.goBack')}
          accessibilityRole="button"
          testID="analogy-back-button"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
        <Text
          className="text-h2 font-bold text-text-primary"
          testID="analogy-preference-title"
        >
          {t('onboarding.analogyPreference.title')}
        </Text>
        <Text className="text-body text-text-secondary mt-2">
          {t('onboarding.analogyPreference.subtitle')}
        </Text>
      </View>

      {/* Picker — ScrollView needed: 7 options at ~72dp each overflow on ≤640dp screens */}
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <AnalogyDomainPicker
          value={selectedDomain}
          onSelect={setSelectedDomain}
          disabled={isPending}
        />
      </ScrollView>

      {/* Actions */}
      <View
        className="px-5 pb-6"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <Pressable
          onPress={handleContinue}
          disabled={isPending}
          className="bg-primary rounded-button py-3.5 items-center mb-2"
          testID="analogy-continue-button"
          accessibilityLabel={t('common.continue')}
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.continue')}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSkip}
          disabled={isPending}
          className="py-3 items-center"
          testID="analogy-skip-button"
          accessibilityLabel={t('onboarding.analogyPreference.skipLabel')}
          accessibilityRole="button"
        >
          <Text className="text-body text-primary font-semibold">
            {t('onboarding.analogyPreference.skipForNow')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
