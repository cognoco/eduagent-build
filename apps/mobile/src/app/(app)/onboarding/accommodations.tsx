import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AccommodationMode } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdateAccommodationMode } from '../../../hooks/use-learner-profile';
import { ACCOMMODATION_OPTIONS } from '../../../lib/accommodation-options';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';

export default function AccommodationsScreen(): React.ReactElement {
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
        onError: () => {
          platformAlert('Could not save setting', 'Please try again.');
        },
      }
    );
  }, [navigateToCurriculum, selectedMode, updateAccommodation]);

  if (!subjectId) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-5"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-text-primary text-body font-semibold mb-4">
          No subject selected
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
        >
          <Text className="text-primary text-body font-semibold">Go back</Text>
        </Pressable>
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
          className="py-2"
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
          How do you learn best?
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          Some learners do best with shorter explanations, audio-first help, or
          very predictable steps. Pick what fits, or skip for now.
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
            Continue
          </Text>
        </Pressable>
        <Pressable
          testID="accommodation-skip"
          className="py-2 items-center"
          onPress={navigateToCurriculum}
        >
          <Text className="text-body text-text-secondary">Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
