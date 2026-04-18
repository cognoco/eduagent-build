import { Text, View } from 'react-native';

interface OnboardingStepIndicatorProps {
  step: number;
  totalSteps: number;
}

export function OnboardingStepIndicator({
  step,
  totalSteps,
}: OnboardingStepIndicatorProps): React.ReactElement {
  const safeTotalSteps = Math.max(totalSteps, 1);
  const activeStep = Math.min(Math.max(step, 1), safeTotalSteps);

  return (
    <View className="items-center py-3 gap-2">
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
      <Text className="text-xs text-muted">
        Step {step} of {safeTotalSteps}
      </Text>
    </View>
  );
}
