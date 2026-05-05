// ---------------------------------------------------------------------------
// Mentor Language Picker — BKT-C.1
// Profile-wide mentor-language selection. Shown during first-time onboarding
// (before the subject interview chat) and from Settings → Mentor Language.
//
// Not to be confused with `language-setup.tsx` which collects a per-subject
// native_language for L1-aware grammar in language-learning sessions. This
// screen writes to profiles.conversation_language.
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ConversationLanguage } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdateConversationLanguage } from '../../../hooks/use-onboarding-dimensions';
import { useFeedbackSubmit } from '../../../hooks/use-feedback';
import { useProfile } from '../../../lib/profile';
import { formatApiError } from '../../../lib/format-api-error';
import { useThemeColors } from '../../../lib/theme';
import { platformAlert } from '../../../lib/platform-alert';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { getOnboardingStepLabels } from '../../../lib/onboarding-step-labels';
import {
  SUPPORTED_LANGUAGES,
  setStoredLanguage,
  i18next,
  type SupportedLanguage,
} from '../../../i18n';

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

// Sentinel selection state for the "Other" tile. Distinct from any
// ConversationLanguage so we never accidentally save 'other' as a language.
type Selection = ConversationLanguage | 'other';

export default function LanguagePickerScreen(): React.ReactElement {
  const { t } = useTranslation();
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
  const stepLabels = getOnboardingStepLabels(t);

  // Pre-select the learner's current language if one is set (e.g., they're
  // editing from Settings). Defaults to 'en' which mirrors the DB default —
  // so a first-time onboarder starts on English but must still explicitly
  // confirm with Continue so the field is not silently defaulted.
  const [selected, setSelected] = useState<Selection>(
    activeProfile?.conversationLanguage ?? 'en'
  );
  const [error, setError] = useState('');
  const [showOtherModal, setShowOtherModal] = useState(false);
  const [otherLanguageInput, setOtherLanguageInput] = useState('');
  const [otherSubmitted, setOtherSubmitted] = useState(false);
  const [otherError, setOtherError] = useState('');
  const updateLanguage = useUpdateConversationLanguage();
  const submitFeedback = useFeedbackSubmit();

  const navigateForward = useCallback(() => {
    if (returnTo === 'settings') {
      // Cross-stack push from More → onboarding/language-picker leaves a
      // 1-deep onboarding stack. router.back() would fall through to the
      // Tabs first route (Home), so replace explicitly.
      router.replace('/(app)/more' as never);
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
    // Cross-stack-push fix: Settings pushes this screen directly from the
    // More tab, so the onboarding stack is 1-deep and router.back() would
    // fall through to the Tabs first-route (Home). Always replace explicitly
    // for both entry points.
    router.replace(
      returnTo === 'settings'
        ? ('/(app)/more' as never)
        : ('/(app)/home' as never)
    );
  }, [returnTo, router]);

  // After a successful save, optionally offer to switch the app UI to match.
  // Gated behind FEATURE_FLAGS.I18N_ENABLED + SUPPORTED_LANGUAGES — when the
  // multi-language pipeline ships, picking a mentor language we already
  // translate the app into prompts the user to swap the interface too.
  const maybePromptUiSwap = useCallback(
    (picked: ConversationLanguage) => {
      const currentLang = i18next.language;
      const isAppSupported = (
        SUPPORTED_LANGUAGES as readonly string[]
      ).includes(picked);
      if (
        !FEATURE_FLAGS.I18N_ENABLED ||
        !isAppSupported ||
        picked === currentLang
      ) {
        navigateForward();
        return;
      }
      const pickedLabel =
        LANGUAGE_OPTIONS.find((o) => o.code === picked)?.label ?? picked;
      platformAlert(
        t('onboarding.mentorLanguagePicker.swapAppPrompt.title', {
          language: pickedLabel,
        }),
        t('onboarding.mentorLanguagePicker.swapAppPrompt.message', {
          language: pickedLabel,
        }),
        [
          {
            text: t('onboarding.mentorLanguagePicker.swapAppPrompt.decline'),
            style: 'cancel',
            onPress: navigateForward,
          },
          {
            text: t('onboarding.mentorLanguagePicker.swapAppPrompt.accept'),
            onPress: async () => {
              try {
                await setStoredLanguage(picked as SupportedLanguage);
                await i18next.changeLanguage(picked);
              } catch (err) {
                console.warn('[language-picker] UI swap failed:', err);
              }
              navigateForward();
            },
          },
        ]
      );
    },
    [navigateForward, t]
  );

  const handleContinue = useCallback(() => {
    setError('');
    if (selected === 'other') {
      setOtherSubmitted(false);
      setOtherError('');
      setOtherLanguageInput('');
      setShowOtherModal(true);
      return;
    }
    updateLanguage.mutate(
      { conversationLanguage: selected },
      {
        onSuccess: () => maybePromptUiSwap(selected),
        onError: (err) => {
          setError(formatApiError(err));
        },
      }
    );
  }, [selected, updateLanguage, maybePromptUiSwap]);

  const handleSubmitOther = useCallback(() => {
    const trimmed = otherLanguageInput.trim();
    if (trimmed.length === 0) return;
    setOtherError('');
    submitFeedback.mutate(
      {
        category: 'other',
        message: `Mentor language request: ${trimmed}`,
        appVersion: Constants.expoConfig?.version ?? undefined,
        platform: Platform.OS as 'ios' | 'android' | 'web',
        osVersion: Platform.Version?.toString(),
      },
      {
        onSuccess: () => setOtherSubmitted(true),
        onError: (err) => setOtherError(formatApiError(err)),
      }
    );
  }, [otherLanguageInput, submitFeedback]);

  const handleCloseOther = useCallback(() => {
    setShowOtherModal(false);
    setOtherSubmitted(false);
    setOtherError('');
    setOtherLanguageInput('');
    submitFeedback.reset();
    // Roll selection back to whatever the profile already has (or English),
    // so leaving the modal doesn't strand the picker on an unsavable 'other'.
    setSelected(activeProfile?.conversationLanguage ?? 'en');
  }, [activeProfile?.conversationLanguage, submitFeedback]);

  const canSubmitOther =
    otherLanguageInput.trim().length > 0 && !submitFeedback.isPending;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="px-5 pt-2">
        <Pressable
          testID="language-picker-back"
          onPress={handleBack}
          className="min-h-[44px] min-w-[44px] items-center justify-center self-start"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        {returnTo === 'settings' ? null : (
          <OnboardingStepIndicator
            step={step}
            totalSteps={totalSteps}
            stepLabels={stepLabels}
          />
        )}
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Text className="text-h2 font-bold text-text-primary mt-4 mb-2">
          {t('onboarding.mentorLanguagePicker.title')}
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          {t('onboarding.mentorLanguagePicker.subtitle')}
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

          {/* "Other" tile — opens a free-text capture modal that submits the
              request via the feedback endpoint so we can track demand. */}
          <Pressable
            testID="language-option-other"
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'other' }}
            className={`rounded-card border-2 px-4 py-4 ${
              selected === 'other'
                ? 'border-primary bg-primary-soft'
                : 'border-border bg-surface-elevated'
            }`}
            onPress={() => setSelected('other')}
          >
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-body font-semibold text-text-primary">
                  {t('onboarding.mentorLanguagePicker.otherLabel')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {t('onboarding.mentorLanguagePicker.otherSublabel')}
                </Text>
              </View>
              {selected === 'other' ? (
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={colors.primary}
                />
              ) : null}
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <View className="px-5 py-4">
        {error !== '' && (
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-3">
            <Text className="text-danger text-body-sm">{error}</Text>
          </View>
        )}
        <Pressable
          testID="language-picker-continue"
          className="bg-primary rounded-button py-4 items-center"
          onPress={handleContinue}
          disabled={updateLanguage.isPending}
          accessibilityState={{ disabled: updateLanguage.isPending }}
        >
          <Text className="text-text-inverse text-body font-semibold">
            {updateLanguage.isPending
              ? t('onboarding.common.saving')
              : t('common.continue')}
          </Text>
        </Pressable>
        {returnTo === 'settings' && (
          <Pressable
            testID="language-picker-cancel"
            className="py-3 mt-2 items-center"
            onPress={handleBack}
            accessibilityRole="button"
          >
            <Text className="text-primary text-body font-semibold">
              {t('common.cancel')}
            </Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={showOtherModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseOther}
        testID="language-other-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-background"
          // RN Web's Modal sets pointer-events:none on its root container
          // and never toggles it back when visible — force 'auto' so child
          // elements remain interactive on web. Mirrors FeedbackSheet.tsx.
          style={{
            pointerEvents: 'auto',
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <Pressable
              onPress={handleCloseOther}
              className="min-w-[44px] min-h-[44px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="language-other-close"
            >
              <Text className="text-primary text-body font-semibold">
                {t('onboarding.mentorLanguagePicker.otherModal.cancel')}
              </Text>
            </Pressable>
            <Text className="text-h3 font-semibold text-text-primary">
              {t('onboarding.mentorLanguagePicker.otherModal.title')}
            </Text>
            <View style={{ minWidth: 44 }} />
          </View>

          {otherSubmitted ? (
            <View className="flex-1 items-center justify-center px-5">
              <Text className="text-h2 font-bold text-text-primary mb-2">
                {t('onboarding.mentorLanguagePicker.otherModal.thanksTitle')}
              </Text>
              <Text className="text-body text-text-secondary text-center mb-6">
                {t('onboarding.mentorLanguagePicker.otherModal.thanksMessage')}
              </Text>
              <Pressable
                onPress={handleCloseOther}
                className="bg-primary rounded-button py-3.5 px-8"
                accessibilityRole="button"
                testID="language-other-done"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('onboarding.mentorLanguagePicker.otherModal.thanksDone')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                className="flex-1 px-5 pt-4"
                keyboardShouldPersistTaps="handled"
              >
                <Text className="text-body text-text-secondary mb-4">
                  {t('onboarding.mentorLanguagePicker.otherModal.subtitle')}
                </Text>
                <TextInput
                  className="bg-surface text-text-primary text-body rounded-card px-4 py-3"
                  placeholder={t(
                    'onboarding.mentorLanguagePicker.otherModal.placeholder'
                  )}
                  placeholderTextColor={colors.muted}
                  value={otherLanguageInput}
                  onChangeText={setOtherLanguageInput}
                  maxLength={80}
                  autoFocus
                  editable={!submitFeedback.isPending}
                  testID="language-other-input"
                />
              </ScrollView>

              <View className="px-5 pb-4">
                {otherError !== '' && (
                  <View className="bg-danger/10 rounded-card px-4 py-3 mb-3">
                    <Text className="text-danger text-body-sm">
                      {otherError}
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={handleSubmitOther}
                  disabled={!canSubmitOther}
                  className={`rounded-button py-3.5 items-center ${
                    canSubmitOther ? 'bg-primary' : 'bg-primary/40'
                  }`}
                  accessibilityRole="button"
                  testID="language-other-submit"
                >
                  {submitFeedback.isPending ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text className="text-body font-semibold text-text-inverse">
                      {t('onboarding.mentorLanguagePicker.otherModal.submit')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
