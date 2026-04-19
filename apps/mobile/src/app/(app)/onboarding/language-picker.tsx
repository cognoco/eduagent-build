// ---------------------------------------------------------------------------
// Language Picker — BKT-C.1
// Profile-wide tutor-language selection. Shown during first-time onboarding
// (before the subject interview chat) and from Settings → Tutor Language.
//
// Not to be confused with `language-setup.tsx` which collects a per-subject
// native_language for L1-aware grammar in language-learning sessions. This
// screen writes to profiles.conversation_language.
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ConversationLanguage } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdateConversationLanguage } from '../../../hooks/use-onboarding-dimensions';
import { useProfile } from '../../../lib/profile';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';

// Ordered to put English first (most common), then alphabetical by English name
// so the list feels stable. The 8 languages match the Zod enum exactly — adding
// a 9th requires updating packages/schemas/src/profiles.ts, the DB CHECK, and
// this list together.
const LANGUAGE_OPTIONS: Array<{
  code: ConversationLanguage;
  label: string;
  nativeLabel: string;
}> = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
];

export default function LanguagePickerScreen(): React.ReactElement {
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
    // When launched from Settings, returnTo='settings' sends the user back
    // to the Settings screen on save instead of forward into onboarding.
    returnTo?: string;
  }>();
  const step = Number(stepParam) || 1;
  const totalSteps = Number(totalStepsParam) || 4;

  // Pre-select the learner's current language if one is set (e.g., they're
  // editing from Settings). Defaults to 'en' which mirrors the DB default —
  // so a first-time onboarder starts on English but must still explicitly
  // confirm with Continue so the field is not silently defaulted.
  const [selected, setSelected] = useState<ConversationLanguage>(
    activeProfile?.conversationLanguage ?? 'en'
  );
  const updateLanguage = useUpdateConversationLanguage();

  const navigateForward = useCallback(() => {
    if (returnTo === 'settings') {
      goBackOrReplace(router, '/(app)/more' as never);
      return;
    }
    // Default forward path during first-time onboarding: pronouns picker
    // (which self-skips for age < 13) then into the subject interview.
    router.replace({
      pathname: '/(app)/onboarding/pronouns',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        step: String(Math.min(step + 1, totalSteps)),
        totalSteps: String(totalSteps),
      },
    } as never);
  }, [returnTo, router, subjectId, subjectName, step, totalSteps]);

  const handleBack = useCallback(() => {
    // Language is the first step for first-time onboarding — Back goes Home.
    // For Settings-originated flow, Back also returns to Settings.
    goBackOrReplace(
      router,
      returnTo === 'settings'
        ? ('/(app)/more' as never)
        : ('/(app)/home' as never)
    );
  }, [returnTo, router]);

  const handleContinue = useCallback(() => {
    updateLanguage.mutate(
      { conversationLanguage: selected },
      {
        onSuccess: navigateForward,
        onError: () => {
          // Specific-error-first per the UX resilience rules; the Zod
          // validator rejects out-of-whitelist codes with a typed error and
          // the client hook surfaces it. Generic fallback here as a
          // defense-in-depth only.
          platformAlert(
            'Could not save language',
            'Please check your connection and try again.'
          );
        },
      }
    );
  }, [selected, updateLanguage, navigateForward]);

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="px-5 pt-2">
        <Pressable
          testID="language-picker-back"
          onPress={handleBack}
          className="py-2"
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
          Which language should your tutor speak?
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          You can still switch mid-conversation — the tutor follows your lead.
          This only sets the default.
        </Text>

        <View className="gap-3">
          {LANGUAGE_OPTIONS.map((opt) => {
            const isSelected = selected === opt.code;
            return (
              <Pressable
                key={opt.code}
                testID={`language-option-${opt.code}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                className={`rounded-card border-2 px-4 py-4 ${
                  isSelected
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface-elevated'
                }`}
                onPress={() => setSelected(opt.code)}
              >
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-body font-semibold text-text-primary">
                      {opt.label}
                    </Text>
                    {opt.nativeLabel !== opt.label ? (
                      <Text className="text-body-sm text-text-secondary mt-1">
                        {opt.nativeLabel}
                      </Text>
                    ) : null}
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

      <View className="px-5 py-4">
        <Pressable
          testID="language-picker-continue"
          className="bg-primary rounded-button py-4 items-center"
          onPress={handleContinue}
          disabled={updateLanguage.isPending}
          accessibilityState={{ disabled: updateLanguage.isPending }}
        >
          <Text className="text-text-inverse text-body font-semibold">
            {updateLanguage.isPending ? 'Saving…' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
