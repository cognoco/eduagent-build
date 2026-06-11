import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Profile } from '@eduagent/schemas';
import { useThemeColors } from '../../../../lib/theme';
import {
  getPreviewState,
  clearPreviewState,
  type PreviewOnboardingStateV0,
  type SaveTarget,
} from '../../../../lib/preview-onboarding-state';
import { track } from '../../../../lib/analytics';
import {
  SAVE_TARGETS,
  defaultTargetFor,
  type WizardStep,
} from '../../_lib/save-wizard-targets';
import { ProfileBasicsStep } from './ProfileBasicsStep';
import { ConfirmStep } from './ConfirmStep';

/**
 * [CRITICAL-A2] Save-wizard gate — shown when a user arrives post-OAuth with
 * a valid preview-onboarding state (they previewed the app before signing up).
 * Renders INLINE (not as a nested Expo Router route) so it stays mounted across
 * the profile-creation transition (ProfileProvider auto-activates the first
 * profile; a nested route would unmount mid-wizard at that point).
 *
 * Multi-step controller: Step 1 = target selection, Step 2 = profile basics
 * (Task 13), Step 3 = confirm + landing (Task 14).
 */
export function SaveWizardGate({
  onComplete,
  onStart,
}: {
  onComplete: () => void;
  onStart: () => void;
}): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [previewState, setLocalPreviewState] =
    React.useState<PreviewOnboardingStateV0 | null>(null);
  const [probeDone, setProbeDone] = React.useState(false);
  const [target, setTarget] = React.useState<SaveTarget | null>(null);
  const [step, setStep] = React.useState<WizardStep>(1);
  const [created, setCreated] = React.useState<{
    parent: Profile;
    child?: Profile;
  } | null>(null);
  const signupCompletionTrackedRef = React.useRef(false);
  const { t } = useTranslation();
  const colors = useThemeColors();

  const handleCancel = React.useCallback(() => {
    clearPreviewState();
    onComplete();
    router.replace('/(app)/home');
  }, [onComplete, router]);

  React.useEffect(() => {
    onStart();
    void getPreviewState().then((s) => {
      setLocalPreviewState(s);
      setTarget(defaultTargetFor(s));
      if (s && !signupCompletionTrackedRef.current) {
        signupCompletionTrackedRef.current = true;
        track('preview_signup_completed', {
          intent: s.intent,
          path: s.path,
          hasTopic: Boolean(s.topicText),
        });
      }
      setProbeDone(true);
    });
  }, [onStart]);

  React.useEffect(() => {
    if (!previewState) return;
    track('save_wizard_step_started', {
      step,
      target: target ?? 'unset',
      intent: previewState.intent,
    });
    track(`save_wizard_step_${step}`, {
      target: target ?? 'unset',
      intent: previewState.intent,
    });
  }, [step, target, previewState]);

  // [CRITICAL-3] Recovery path for "wizard mounted with no state" — happens
  // when the 1h TTL expires between the layout's initial probe and this
  // component's second probe, or when SecureStore is wiped externally
  // (sign-out race). Without this, the wizard renders null and traps the user.
  // [HIGH-A2] Signal completion to the layout BEFORE navigating, so the wizard
  // branch in AppLayout exits cleanly and falls through to the next gate.
  React.useEffect(() => {
    if (probeDone && !previewState) {
      onComplete();
      router.replace('/(app)/home');
    }
  }, [probeDone, previewState, router, onComplete]);

  if (!previewState) {
    return <View testID="save-wizard-gate" className="flex-1 bg-background" />;
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
      testID="save-wizard-gate"
    >
      <View testID={`save-wizard-step-${step}`} />
      {/* Header row: back (Steps 2–3 only) on the left, cancel ✕ always on the right */}
      <View className="flex-row justify-between items-center mb-4">
        {step > 1 ? (
          <Pressable
            onPress={() => setStep((s) => (s - 1) as WizardStep)}
            accessibilityRole="button"
            accessibilityLabel="Back to previous step"
            testID="save-wizard-back"
            className="p-1"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel and exit"
          testID="save-wizard-cancel"
          className="p-1"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
      <Text className="text-h1 font-bold text-text-primary mb-2">
        {t('saveWizard.title')}
      </Text>

      {step === 1 && (
        <View>
          <Text className="text-body text-text-secondary mb-6">
            {t('saveWizard.whereSave')}
          </Text>
          {SAVE_TARGETS.map((opt) => {
            const selected = target === opt.target;
            return (
              <Pressable
                key={opt.target}
                onPress={() => setTarget(opt.target)}
                className={`rounded-card px-4 py-4 mb-3 ${selected ? 'bg-primary/10 border border-primary' : 'bg-surface'}`}
                testID={opt.testID}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => target && setStep(2)}
            disabled={!target}
            className={`rounded-button py-3.5 items-center mt-4 ${target ? 'bg-primary' : 'bg-primary/40'}`}
            testID="save-wizard-step-1-continue"
            accessibilityRole="button"
            accessibilityState={{ disabled: !target }}
          >
            <Text className="text-body font-semibold text-text-inverse">
              {t('common.continue')}
            </Text>
          </Pressable>
        </View>
      )}

      {step === 2 && target && (
        <ProfileBasicsStep
          target={target}
          previewState={previewState}
          onComplete={(c) => {
            setCreated(c);
            setStep(3);
          }}
        />
      )}

      {step === 3 && target && created && (
        <ConfirmStep
          target={target}
          previewState={previewState}
          created={created}
          router={router}
          onComplete={onComplete} // [HIGH-A2] forwarded from layout
        />
      )}
    </ScrollView>
  );
}
