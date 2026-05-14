import type { Translate } from '../i18n';

export function getOnboardingStepLabels(t: Translate): string[] {
  return [
    t('onboarding.common.stepLabels.quickChat'),
    t('onboarding.common.stepLabels.makeItPersonal'),
    t('onboarding.common.stepLabels.supportOptions'),
    t('onboarding.common.stepLabels.yourPlan'),
  ];
}
