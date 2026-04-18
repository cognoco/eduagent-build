import { render, screen } from '@testing-library/react-native';
import { OnboardingStepIndicator } from './OnboardingStepIndicator';

describe('OnboardingStepIndicator', () => {
  it('renders the correct number of dots', () => {
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);

    expect(screen.getByTestId('step-dot-1')).toBeTruthy();
    expect(screen.getByTestId('step-dot-2')).toBeTruthy();
    expect(screen.getByTestId('step-dot-3')).toBeTruthy();
    expect(screen.getByTestId('step-dot-4')).toBeTruthy();
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
    render(<OnboardingStepIndicator step={2} totalSteps={4} />);

    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
  });
});
