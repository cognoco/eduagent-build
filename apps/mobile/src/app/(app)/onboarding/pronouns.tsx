// ---------------------------------------------------------------------------
// Pronouns Picker — BKT-C.1
// Optional profile-wide pronouns selection. Gated by PRONOUNS_PROMPT_MIN_AGE
// (13) — below that, the screen self-skips forward so the learner is never
// shown the field. Parents can still set pronouns later in child settings.
//
// Never surfaced to other learners — the router includes it only in the
// active learner's safety preamble.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PRONOUNS_PROMPT_MIN_AGE } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdatePronouns } from '../../../hooks/use-onboarding-dimensions';
import { useStartFirstCurriculumSession } from '../../../hooks/use-sessions';
import { useProfile } from '../../../lib/profile';
import { goBackOrReplace } from '../../../lib/navigation';
import { getOnboardingStepLabels } from '../../../lib/onboarding-step-labels';
import { platformAlert } from '../../../lib/platform-alert';
import { Sentry } from '../../../lib/sentry';
import { useThemeColors } from '../../../lib/theme';
import { useReportActivationEvent } from '../../../lib/activation-events';

const PRESETS = ['she/her', 'he/him', 'they/them'] as const;
// Separate from PRESETS so we can render a distinct "Other" card that opens
// the free-text input. Selecting a preset clears any free-text entry.
const OTHER_KEY = '__other__' as const;
const PRONOUNS_MAX_LENGTH = 32;

type Choice = (typeof PRESETS)[number] | typeof OTHER_KEY | null;

export default function PronounsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activeProfile, isLoading: isProfileLoading } = useProfile();
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
  const stepLabels = getOnboardingStepLabels(t);

  // The profile may still be resolving at mount (activeProfile undefined,
  // birthYear null). We must NOT evaluate the age gate or render the form
  // until the profile is loaded — otherwise a possibly-sub-13 learner would
  // briefly see the pronouns field, which this screen must never do.
  const profileResolved = !isProfileLoading && activeProfile != null;

  // Compute age from birthYear — the learner's age on Dec 31 of the current
  // year rather than the exact birthdate, which we don't store. This is
  // generous (may over-count by up to a year) but the alternative underprompts.
  const learnerAge = useMemo(() => {
    if (!activeProfile?.birthYear) return null;
    return new Date().getFullYear() - activeProfile.birthYear;
  }, [activeProfile?.birthYear]);
  // [F-145] Fail CLOSED. Once the profile is resolved, a missing/zero birthYear
  // (learnerAge === null) means age cannot be verified — treat as gated so a
  // possibly-sub-13 learner never sees the pronouns field. Previously the
  // `learnerAge !== null` term made the gate fail OPEN on unknown age.
  const ageGated =
    profileResolved &&
    (learnerAge === null || learnerAge < PRONOUNS_PROMPT_MIN_AGE);

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
    initialChoice === OTHER_KEY ? (activeProfile?.pronouns ?? '') : '',
  );
  // BUG-799: The screen can first render while the profile is still loading
  // (activeProfile undefined → initialChoice null). useState only reads the
  // initializer on first mount, so when the profile later resolves with an
  // existing `pronouns` value, `choice` would stay null and pressing Continue
  // would submit `pronouns: null` — silently CLEARING the user's stored value.
  // We sync local `choice`/`customPronouns` from the profile the first time it
  // resolves, but a `userChangedRef` dirty guard ensures a late profile resolve
  // can never clobber an explicit in-session edit.
  const userChangedRef = useRef(false);
  const hasSyncedFromProfileRef = useRef(activeProfile != null);
  const [isForwarding, setIsForwarding] = useState(false);
  // In-flight guard mirroring ExplainedRedirect's hasNavigatedRef: navigateForward
  // can fire startFirstCurriculumSession.mutate (a server side-effect that creates
  // the first curriculum session). The function identity changes whenever the
  // mutation hook returns a new object, so the age-gate effect below can re-run
  // and fire mutate a SECOND time → duplicate session creation. The ref ensures
  // the forward path (and its mutate) runs at most once per mount.
  const hasForwardedRef = useRef(false);
  const updatePronouns = useUpdatePronouns();
  const startFirstCurriculumSession = useStartFirstCurriculumSession(
    subjectId ?? '',
  );
  const reportActivationEvent = useReportActivationEvent();

  const navigateForward = useCallback(() => {
    if (hasForwardedRef.current) return;
    hasForwardedRef.current = true;
    setIsForwarding(true);
    if (returnTo === 'settings') {
      goBackOrReplace(router, '/(app)/more' as Href);
      return;
    }
    // [WI-1689] Pronouns is the final onboarding step (onboarding/index.tsx
    // redirects here first); fire onboarding_completed only for the real
    // onboarding flow, not a Settings re-edit (guarded above).
    reportActivationEvent('onboarding_completed', {
      route: 'onboarding.pronouns',
    });
    if (!subjectId) {
      router.replace('/(app)/home' as const);
      return;
    }
    startFirstCurriculumSession.mutate(
      { sessionType: 'learning', inputMode: 'text' },
      {
        onSuccess: (result) => {
          router.replace({
            pathname: '/(app)/session',
            params: {
              mode: 'learning',
              subjectId,
              subjectName: subjectName ?? '',
              sessionId: result.session.id,
              topicId: result.session.topicId ?? undefined,
            },
          } as Href);
        },
        onError: () => {
          goBackOrReplace(router, '/(app)/home' as const);
        },
      },
    );
  }, [
    returnTo,
    router,
    subjectId,
    subjectName,
    startFirstCurriculumSession,
    reportActivationEvent,
  ]);

  // Age-gate: learners below 13 never see the screen. Silently forward so
  // the back stack doesn't accumulate a useless entry.
  useEffect(() => {
    if (ageGated) {
      navigateForward();
    }
  }, [ageGated, navigateForward]);

  // BUG-799: When the profile resolves after the initial (loading) render,
  // adopt its existing pronouns into local state — but only once, and never
  // over an explicit user change. Without this, a late profile resolve would
  // leave `choice` at its loading-time null and Continue would clear stored
  // pronouns. The dirty guard (`userChangedRef`) makes an explicit in-session
  // edit win over the late resolve.
  useEffect(() => {
    if (hasSyncedFromProfileRef.current) return;
    if (activeProfile == null) return;
    hasSyncedFromProfileRef.current = true;
    if (userChangedRef.current) return;
    setChoice(initialChoice);
    setCustomPronouns(
      initialChoice === OTHER_KEY ? (activeProfile.pronouns ?? '') : '',
    );
  }, [activeProfile, initialChoice]);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, '/(app)/home' as const);
  }, [router]);

  const handleSkip = useCallback(() => {
    // Skip writes null to clear any prior pronouns (Settings edit case) and
    // forwards. Never blocks onboarding progress per spec, so navigate before
    // the best-effort clear can be delayed by network or cache refresh work.
    navigateForward();
    updatePronouns.mutate(
      { pronouns: null },
      {
        onError: (error) => {
          Sentry.captureException(error, {
            tags: {
              screen: 'onboarding_pronouns',
              action: 'skip_clear_pronouns',
            },
          });
        },
      },
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

  // BUG-799: Continue must SET a pronoun, never accidentally clear one.
  // A still-null `choice` (e.g. the form rendered before the profile resolved,
  // or the user simply hasn't picked) is NOT a valid Continue submission — it
  // would write `pronouns: null` and wipe any stored value. The explicit-clear
  // path is the Skip button (`handleSkip`), which intentionally sends null.
  const canContinue =
    choice !== null &&
    (choice !== OTHER_KEY ||
      (customPronouns.trim().length > 0 &&
        customPronouns.length <= PRONOUNS_MAX_LENGTH));

  const handleContinue = useCallback(() => {
    updatePronouns.mutate(
      { pronouns: effectivePronouns },
      {
        onSuccess: navigateForward,
        onError: () => {
          platformAlert(
            t('onboarding.pronouns.saveErrorTitle'),
            t('onboarding.pronouns.saveErrorMessage'),
          );
        },
      },
    );
  }, [effectivePronouns, updatePronouns, navigateForward, t]);

  // Until the profile resolves we cannot know the learner's age, so we must
  // not render the form — a possibly-sub-13 learner could otherwise see the
  // pronouns field during the load window. Render a neutral holding view.
  if (!profileResolved) {
    return <View testID="pronouns-loading" className="flex-1 bg-background" />;
  }
  // While age-gate redirect is in flight, render nothing (brief flicker) —
  // below-13 learners should never see the form even momentarily.
  if (ageGated) return <View className="flex-1 bg-background" />;
  if (isForwarding) {
    return <View pointerEvents="none" style={{ display: 'none' }} />;
  }

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
          {t('onboarding.pronouns.title')}
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          {t('onboarding.pronouns.subtitle')}
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
                  userChangedRef.current = true;
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
            onPress={() => {
              userChangedRef.current = true;
              setChoice(OTHER_KEY);
            }}
          >
            <View className="flex-row items-center">
              <Text className="flex-1 text-body font-semibold text-text-primary">
                {t('onboarding.pronouns.somethingElse')}
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
                onChangeText={(text) => {
                  userChangedRef.current = true;
                  setCustomPronouns(text);
                }}
                placeholder={t('onboarding.pronouns.customPlaceholder')}
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
            {updatePronouns.isPending
              ? t('onboarding.common.saving')
              : t('common.continue')}
          </Text>
        </Pressable>
        <Pressable
          testID="pronouns-skip"
          className="py-2 items-center"
          onPress={handleSkip}
          disabled={updatePronouns.isPending}
        >
          <Text className="text-body text-text-secondary">
            {t('onboarding.common.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
