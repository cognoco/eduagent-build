import { Text, View } from 'react-native';

interface OnboardingStepIndicatorProps {
  step: number;
  totalSteps: number;
}

const DEFAULT_STEP_LABELS = [
  'Quick chat',
  'Make it personal',
  'Support options',
  'Your plan',
];

export function OnboardingStepIndicator({
  step,
  totalSteps,
}: OnboardingStepIndicatorProps): React.ReactElement {
  const safeTotalSteps = Math.max(totalSteps, 1);
  const activeStep = Math.min(Math.max(step, 1), safeTotalSteps);

  return (
    <View
      className="items-center py-3 gap-2"
      accessibilityLabel={`Step ${activeStep} of ${safeTotalSteps}: ${
        DEFAULT_STEP_LABELS[activeStep - 1] ?? 'Almost ready'
      }`}
    >
      <View className="flex-row gap-2">
        {Array.from({ length: safeTotalSteps }, (_, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber <= activeStep;

          return (
            <View
              key={stepNumber}
              testID={`step-dot-${stepNumber}`}
              className={`w-2.5 h-2.5 rounded-full ${
                isActive ? 'bg-primary' : 'bg-muted'
              }`}
            />
          );
        })}
      </View>
      <View className="items-center">
        <Text className="text-xs text-muted">
          Step {activeStep} of {safeTotalSteps}
        </Text>
        <Text className="text-body-sm font-semibold text-text-primary mt-1">
          {DEFAULT_STEP_LABELS[activeStep - 1] ?? 'Almost ready'}
        </Text>
      </View>
    </View>
  );
}
