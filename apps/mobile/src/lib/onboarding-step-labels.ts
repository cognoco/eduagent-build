type Translate = (key: string, options?: Record<string, unknown>) => string;

export function getOnboardingStepLabels(t: Translate): string[] {
  return [
    t('onboarding.common.stepLabels.quickChat'),
    t('onboarding.common.stepLabels.makeItPersonal'),
    t('onboarding.common.stepLabels.supportOptions'),
    t('onboarding.common.stepLabels.yourPlan'),
  ];
}
