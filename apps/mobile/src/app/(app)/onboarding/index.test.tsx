import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const OnboardingIndex = require('./index').default as React.ComponentType;

describe('OnboardingIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('explains why the learner is being forwarded before continuing', () => {
    render(<OnboardingIndex />);

    screen.getByTestId('onboarding-index-redirect');
    screen.getByText('onboarding.index.redirectTitle');
    screen.getByText('onboarding.index.redirectBody');
    screen.getByTestId('onboarding-index-continue');
  });

  it('lets the learner continue immediately', () => {
    render(<OnboardingIndex />);

    fireEvent.press(screen.getByTestId('onboarding-index-continue'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/onboarding/pronouns');
  });

  it('still auto-continues after a short delay', () => {
    render(<OnboardingIndex />);

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(mockReplace).toHaveBeenCalledWith('/(app)/onboarding/pronouns');
  });
});
