// ---------------------------------------------------------------------------
// Pronouns Picker — BKT-C.1
// Optional profile-wide pronouns selection. Gated by PRONOUNS_PROMPT_MIN_AGE
// (13) — below that, the screen self-skips forward so the learner is never
// shown the field. Parents can still set pronouns later in child settings.
//
// Never surfaced to other learners — the router includes it only in the
// active learner's safety preamble.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PRONOUNS_PROMPT_MIN_AGE } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdatePronouns } from '../../../hooks/use-onboarding-dimensions';
import { useProfile } from '../../../lib/profile';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';

const PRESETS = ['she/her', 'he/him', 'they/them'] as const;
// Separate from PRESETS so we can render a distinct "Other" card that opens
// the free-text input. Selecting a preset clears any free-text entry.
const OTHER_KEY = '__other__' as const;
const PRONOUNS_MAX_LENGTH = 32;

type Choice = (typeof PRESETS)[number] | typeof OTHER_KEY | null;

export default function PronounsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const {
    subjectId,
    subjectName,
    step: stepParam,
    totalSteps: totalStepsParam,
    returnTo,
  } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    step?: string;
    totalSteps?: string;
    returnTo?: string;
  }>();
  const step = Number(stepParam) || 2;
  const totalSteps = Number(totalStepsParam) || 4;

  // Compute age from birthYear — the learner's age on Dec 31 of the current
  // year rather than the exact birthdate, which we don't store. This is
  // generous (may over-count by up to a year) but the alternative underprompts.
  const learnerAge = useMemo(() => {
    if (!activeProfile?.birthYear) return null;
    return new Date().getFullYear() - activeProfile.birthYear;
  }, [activeProfile?.birthYear]);
  const ageGated = learnerAge !== null && learnerAge < PRONOUNS_PROMPT_MIN_AGE;

  // Initialize from existing pronouns value so Settings-triggered edits
  // pre-populate. Preset match ignores case and whitespace.
  const initialChoice: Choice = useMemo(() => {
    const current = activeProfile?.pronouns?.trim().toLowerCase() ?? '';
    if (!current) return null;
    const match = PRESETS.find((p) => p === current);
    return match ?? OTHER_KEY;
  }, [activeProfile?.pronouns]);

  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [customPronouns, setCustomPronouns] = useState(
    initialChoice === OTHER_KEY ? activeProfile?.pronouns ?? '' : ''
  );
  const updatePronouns = useUpdatePronouns();

  const navigateForward = useCallback(() => {
    if (returnTo === 'settings') {
      goBackOrReplace(router, '/(app)/more' as never);
      return;
    }
    // Forward path in first-time onboarding: into the subject interview.
    router.replace({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        step: String(Math.min(step + 1, totalSteps)),
        totalSteps: String(totalSteps),
      },
    } as never);
  }, [returnTo, router, subjectId, subjectName, step, totalSteps]);

  // Age-gate: learners below 13 never see the screen. Silently forward so
  // the back stack doesn't accumulate a useless entry.
  useEffect(() => {
    if (ageGated) {
      navigateForward();
    }
  }, [ageGated, navigateForward]);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, {
      pathname: '/(app)/onboarding/language-picker',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        step: String(Math.max(step - 1, 1)),
        totalSteps: String(totalSteps),
      },
    });
  }, [router, subjectId, subjectName, step, totalSteps]);

  const handleSkip = useCallback(() => {
    // Skip writes null to clear any prior pronouns (Settings edit case) and
    // forwards. Never blocks onboarding progress per spec.
    updatePronouns.mutate(
      { pronouns: null },
      {
        onSuccess: navigateForward,
        // Skip is non-blocking — if the clear fails, still move forward
        // rather than trapping the user.
        onError: navigateForward,
      }
    );
  }, [updatePronouns, navigateForward]);

  const effectivePronouns = useMemo(() => {
    if (choice === null) return null;
    if (choice === OTHER_KEY) {
      const trimmed = customPronouns.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return choice;
  }, [choice, customPronouns]);

  const canContinue =
    choice !== OTHER_KEY ||
    (customPronouns.trim().length > 0 &&
      customPronouns.length <= PRONOUNS_MAX_LENGTH);

  const handleContinue = useCallback(() => {
    updatePronouns.mutate(
      { pronouns: effectivePronouns },
      {
        onSuccess: navigateForward,
        onError: () => {
          platformAlert(
            'Could not save pronouns',
            'Please check your connection and try again.'
          );
        },
      }
    );
  }, [effectivePronouns, updatePronouns, navigateForward]);

  // While age-gate redirect is in flight, render nothing (brief flicker) —
  // below-13 learners should never see the form even momentarily.
  if (ageGated) return <View className="flex-1 bg-background" />;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="px-5 pt-2">
        <Pressable
          testID="pronouns-back"
          onPress={handleBack}
          className="min-h-[44px] min-w-[44px] items-center justify-center self-start"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        {returnTo === 'settings' ? null : (
          <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
        )}
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Text className="text-h2 font-bold text-text-primary mt-4 mb-2">
          What pronouns should I use?
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          Optional — only you see this. I&apos;ll use it when referring to you
          in replies.
        </Text>

        <View className="gap-3">
          {PRESETS.map((p) => {
            const isSelected = choice === p;
            return (
              <Pressable
                key={p}
                testID={`pronouns-option-${p.replace('/', '-')}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                className={`rounded-card border-2 px-4 py-4 ${
                  isSelected
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface-elevated'
                }`}
                onPress={() => {
                  setChoice(p);
                  setCustomPronouns('');
                }}
              >
                <View className="flex-row items-center">
                  <Text className="flex-1 text-body font-semibold text-text-primary">
                    {p}
                  </Text>
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

          <Pressable
            testID="pronouns-option-other"
            accessibilityRole="radio"
            accessibilityState={{ selected: choice === OTHER_KEY }}
            className={`rounded-card border-2 px-4 py-4 ${
              choice === OTHER_KEY
                ? 'border-primary bg-primary-soft'
                : 'border-border bg-surface-elevated'
            }`}
            onPress={() => setChoice(OTHER_KEY)}
          >
            <View className="flex-row items-center">
              <Text className="flex-1 text-body font-semibold text-text-primary">
                Something else
              </Text>
              {choice === OTHER_KEY ? (
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={colors.primary}
                />
              ) : null}
            </View>
            {choice === OTHER_KEY ? (
              <TextInput
                testID="pronouns-custom-input"
                className="mt-3 bg-surface rounded-input px-3 py-2 text-body text-text-primary"
                value={customPronouns}
                onChangeText={setCustomPronouns}
                placeholder="e.g. xe/xem"
                placeholderTextColor={colors.textSecondary}
                maxLength={PRONOUNS_MAX_LENGTH}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
              />
            ) : null}
          </Pressable>
        </View>
      </ScrollView>

      <View className="px-5 py-4 gap-3">
        <Pressable
          testID="pronouns-continue"
          className={`rounded-button py-4 items-center ${
            canContinue ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          onPress={handleContinue}
          disabled={!canContinue || updatePronouns.isPending}
          accessibilityState={{
            disabled: !canContinue || updatePronouns.isPending,
          }}
        >
          <Text
            className={`text-body font-semibold ${
              canContinue ? 'text-text-inverse' : 'text-text-tertiary'
            }`}
          >
            {updatePronouns.isPending ? 'Saving…' : 'Continue'}
          </Text>
        </Pressable>
        <Pressable
          testID="pronouns-skip"
          className="py-2 items-center"
          onPress={handleSkip}
          disabled={updatePronouns.isPending}
        >
          <Text className="text-body text-text-secondary">Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
