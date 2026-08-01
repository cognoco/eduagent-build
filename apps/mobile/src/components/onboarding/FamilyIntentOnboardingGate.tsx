import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../common/Button';
import {
  clearFamilyIntentOnboarding,
  updateFamilyIntentOnboardingStep,
  type FamilyIntentOnboardingState,
  type FamilyIntentOnboardingStep,
} from '../../lib/family-intent-onboarding-state';
import { queueMentorBornCeremony } from '../../lib/mentor-born-ceremony';

type Props = {
  state: FamilyIntentOnboardingState;
  onStateChange: (state: FamilyIntentOnboardingState) => void;
  onComplete: () => void;
  onOpenInvitation: () => void;
};

export function FamilyIntentOnboardingGate({
  state,
  onStateChange,
  onComplete,
  onOpenInvitation,
}: Props): React.ReactElement {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [actionFailed, setActionFailed] = React.useState(false);

  React.useEffect(() => {
    if (state.step !== 'opening-invitation') return;
    onOpenInvitation();
  }, [onOpenInvitation, state.step]);

  const moveTo = React.useCallback(
    async (step: FamilyIntentOnboardingStep) => {
      setBusy(true);
      setActionFailed(false);
      try {
        await updateFamilyIntentOnboardingStep(step);
        onStateChange({ ...state, step });
      } catch {
        setActionFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [onStateChange, state],
  );

  const chooseMe = React.useCallback(async () => {
    setBusy(true);
    setActionFailed(false);
    try {
      await queueMentorBornCeremony({
        profileId: state.profileId,
        reason: 'first-profile-created',
      });
      await clearFamilyIntentOnboarding();
      onComplete();
    } catch {
      setActionFailed(true);
    } finally {
      setBusy(false);
    }
  }, [onComplete, state.profileId]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow justify-center gap-5 px-6 py-10"
      contentInsetAdjustmentBehavior="automatic"
      testID="family-intent-onboarding-gate"
    >
      {actionFailed ? (
        <Text
          className="text-body text-danger"
          testID="family-intent-action-error"
        >
          {t('familyIntentOnboarding.actionError')}
        </Text>
      ) : null}

      {state.step === 'learner-target' ? (
        <>
          <View className="gap-2">
            <Text className="text-display-sm font-bold text-text-primary">
              {t('familyIntentOnboarding.target.title')}
            </Text>
            <Text className="text-body text-text-secondary">
              {t('familyIntentOnboarding.target.message')}
            </Text>
          </View>
          <View className="gap-3">
            <Button
              variant="primary"
              label={t('familyIntentOnboarding.target.me')}
              disabled={busy}
              onPress={() => void chooseMe()}
              testID="family-intent-target-me"
            />
            <Button
              variant="secondary"
              label={t('familyIntentOnboarding.target.someoneElse')}
              disabled={busy}
              onPress={() => void moveTo('login-choice')}
              testID="family-intent-target-someone-else"
            />
          </View>
        </>
      ) : null}

      {state.step === 'login-choice' ? (
        <>
          <View className="gap-2">
            <Text className="text-display-sm font-bold text-text-primary">
              {t('familyIntentOnboarding.login.title')}
            </Text>
            <Text className="text-body text-text-secondary">
              {t('familyIntentOnboarding.login.message')}
            </Text>
          </View>
          <View className="gap-3">
            <Button
              variant="primary"
              label={t('familyIntentOnboarding.login.yes')}
              disabled={busy}
              onPress={() => void moveTo('opening-invitation')}
              testID="family-intent-login-yes"
            />
            <Button
              variant="secondary"
              label={t('familyIntentOnboarding.login.no')}
              disabled={busy}
              onPress={() => void moveTo('managed-unavailable')}
              testID="family-intent-login-no"
            />
          </View>
        </>
      ) : null}

      {state.step === 'managed-unavailable' ? (
        <>
          <View className="gap-2">
            <Text className="text-display-sm font-bold text-text-primary">
              {t('familyIntentOnboarding.managedUnavailable.title')}
            </Text>
            <Text className="text-body text-text-secondary">
              {t('familyIntentOnboarding.managedUnavailable.message')}
            </Text>
          </View>
          <Button
            variant="secondary"
            label={t('common.goBack')}
            disabled={busy}
            onPress={() => void moveTo('login-choice')}
            testID="family-intent-managed-back"
          />
        </>
      ) : null}

      {state.step === 'opening-invitation' ? (
        <ActivityIndicator
          size="large"
          accessibilityLabel={t('common.loading')}
        />
      ) : null}
    </ScrollView>
  );
}
