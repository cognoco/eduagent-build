import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ subjectId: 'subject-1' }),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const MockSafeAreaView = View;
  MockSafeAreaView.displayName = 'SafeAreaView';
  const MockSafeAreaProvider = ({ children }: { children: React.ReactNode }) =>
    children;
  MockSafeAreaProvider.displayName = 'SafeAreaProvider';
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: MockSafeAreaView,
    SafeAreaProvider: MockSafeAreaProvider,
    SafeAreaInsetsContext: { Consumer: View },
    initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  };
});

const mockMutate = jest.fn();
let mockIsPending = false;

jest.mock('../../../hooks/use-settings', () => ({
  useUpdateAnalogyDomain: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

// Must be required after mocks
const AnalogyPreferenceScreen = require('./analogy-preference').default;

describe('AnalogyPreferenceScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPending = false;
  });

  it('renders the title', () => {
    render(<AnalogyPreferenceScreen />);

    expect(screen.getByText('How do you like things explained?')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    render(<AnalogyPreferenceScreen />);

    expect(screen.getByText(/Pick an analogy style \(optional\)/)).toBeTruthy();
  });

  it('renders the analogy domain picker', () => {
    render(<AnalogyPreferenceScreen />);

    expect(screen.getByTestId('analogy-domain-picker')).toBeTruthy();
  });

  it('renders continue and skip buttons', () => {
    render(<AnalogyPreferenceScreen />);

    expect(screen.getByTestId('analogy-continue-button')).toBeTruthy();
    expect(screen.getByTestId('analogy-skip-button')).toBeTruthy();
  });

  it('navigates to curriculum-review when skip is pressed', () => {
    render(<AnalogyPreferenceScreen />);

    fireEvent.press(screen.getByTestId('analogy-skip-button'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(learner)/onboarding/curriculum-review',
      params: { subjectId: 'subject-1' },
    });
  });

  it('navigates to curriculum-review when continue is pressed without selection', () => {
    render(<AnalogyPreferenceScreen />);

    fireEvent.press(screen.getByTestId('analogy-continue-button'));

    // No domain selected, should navigate directly without mutation
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(learner)/onboarding/curriculum-review',
      params: { subjectId: 'subject-1' },
    });
  });

  it('saves domain and navigates when continue is pressed with selection', async () => {
    // Make mutate call onSettled immediately
    mockMutate.mockImplementation(
      (_domain: string, options: { onSettled?: () => void }) => {
        options.onSettled?.();
      }
    );

    render(<AnalogyPreferenceScreen />);

    // Select a domain
    fireEvent.press(screen.getByTestId('analogy-domain-cooking'));
    // Press continue
    fireEvent.press(screen.getByTestId('analogy-continue-button'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        'cooking',
        expect.objectContaining({ onSettled: expect.any(Function) })
      );
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(learner)/onboarding/curriculum-review',
      params: { subjectId: 'subject-1' },
    });
  });

  it('shows all domain options', () => {
    render(<AnalogyPreferenceScreen />);

    expect(screen.getByTestId('analogy-domain-none')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-cooking')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-sports')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-building')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-music')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-nature')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-gaming')).toBeTruthy();
  });

  it('does not call mutate when skip is pressed', () => {
    render(<AnalogyPreferenceScreen />);

    fireEvent.press(screen.getByTestId('analogy-skip-button'));

    expect(mockMutate).not.toHaveBeenCalled();
  });
});
