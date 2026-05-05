import { render, screen } from '@testing-library/react-native';
import { OnboardingStepIndicator } from './OnboardingStepIndicator';

describe('OnboardingStepIndicator', () => {
  it('renders the correct number of dots', () => {
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);

    screen.getByTestId('step-dot-1');
    screen.getByTestId('step-dot-2');
    screen.getByTestId('step-dot-3');
    screen.getByTestId('step-dot-4');
  });

  it('marks current and past steps as active', () => {
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);

    expect(screen.getByTestId('step-dot-1').props.className).toContain(
      'bg-primary'
    );
    expect(screen.getByTestId('step-dot-2').props.className).toContain(
      'bg-primary'
    );
    expect(screen.getByTestId('step-dot-3').props.className).toContain(
      'bg-muted'
    );
  });

  it('shows step label text', () => {
    render(
      <OnboardingStepIndicator
        step={2}
        totalSteps={4}
        stepLabels={[
          'Quick chat',
          'Make it personal',
          'Support options',
          'Your plan',
        ]}
      />
    );

    screen.getByText('Step 2 of 4');
    screen.getByText('Make it personal');
  });

  it('stays label-agnostic when labels are not provided', () => {
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);

    screen.getByText('Step 2 of 4');
    expect(screen.queryByText('Make it personal')).toBeNull();
  });

  it('shows the plan label on the final setup step', () => {
    render(
      <OnboardingStepIndicator
        step={4}
        totalSteps={4}
        stepLabels={[
          'Quick chat',
          'Make it personal',
          'Support options',
          'Your plan',
        ]}
      />
    );

    screen.getByText('Your plan');
  });
});
