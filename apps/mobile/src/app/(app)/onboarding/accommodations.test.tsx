import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockMutate = jest.fn();
let mockIsPending = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(false),
  }),
  useLocalSearchParams: () => ({
    subjectId: 'subject-1',
    subjectName: 'History',
    step: '3',
    totalSteps: '4',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
  }),
}));

jest.mock('../../../hooks/use-learner-profile', () => ({
  useUpdateAccommodationMode: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

const AccommodationsScreen = require('./accommodations').default;

describe('AccommodationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPending = false;
  });

  it('renders all four accommodation options', () => {
    render(<AccommodationsScreen />);

    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.getByText('Short-Burst')).toBeTruthy();
    expect(screen.getByText('Audio-First')).toBeTruthy();
    expect(screen.getByText('Predictable')).toBeTruthy();
  });

  it('pre-selects None by default', () => {
    render(<AccommodationsScreen />);

    expect(
      screen.getByTestId('accommodation-none').props.accessibilityState.selected
    ).toBe(true);
  });

  it('renders the onboarding step indicator', () => {
    render(<AccommodationsScreen />);

    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
  });

  it('navigates back to the prior onboarding step', () => {
    render(<AccommodationsScreen />);

    fireEvent.press(screen.getByTestId('accommodation-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pathname: '/(app)/onboarding/analogy-preference',
        params: expect.objectContaining({
          subjectId: 'subject-1',
          subjectName: 'History',
          step: '2',
          totalSteps: '4',
        }),
      })
    );
  });

  it('navigates to curriculum-review without saving when None is selected', () => {
    render(<AccommodationsScreen />);

    fireEvent.press(screen.getByTestId('accommodation-continue'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/curriculum-review',
      params: {
        subjectId: 'subject-1',
        subjectName: 'History',
        languageCode: '',
        languageName: '',
        step: '4',
        totalSteps: '4',
      },
    });
  });

  it('saves and navigates when a non-default option is selected', () => {
    mockMutate.mockImplementation(
      (
        _input: unknown,
        options: { onSuccess?: () => void; onError?: () => void }
      ) => {
        options.onSuccess?.();
      }
    );

    render(<AccommodationsScreen />);

    fireEvent.press(screen.getByTestId('accommodation-short-burst'));
    fireEvent.press(screen.getByTestId('accommodation-continue'));

    expect(mockMutate).toHaveBeenCalledWith(
      { accommodationMode: 'short-burst' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/curriculum-review',
      params: {
        subjectId: 'subject-1',
        subjectName: 'History',
        languageCode: '',
        languageName: '',
        step: '4',
        totalSteps: '4',
      },
    });
  });

  it('shows skip button that navigates without saving', () => {
    render(<AccommodationsScreen />);

    fireEvent.press(screen.getByTestId('accommodation-skip'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/curriculum-review',
      params: {
        subjectId: 'subject-1',
        subjectName: 'History',
        languageCode: '',
        languageName: '',
        step: '4',
        totalSteps: '4',
      },
    });
  });

  it('shows an alert when save fails and does not navigate', () => {
    // [F-052] platformAlert delegates to Alert.alert on native (Platform.OS !== 'web').
    // In test env, Platform.OS defaults to 'ios', so we spy on Alert.alert.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
      return;
    });
    mockMutate.mockImplementation(
      (
        _input: unknown,
        options: { onSuccess?: () => void; onError?: () => void }
      ) => {
        options.onError?.();
      }
    );

    render(<AccommodationsScreen />);

    fireEvent.press(screen.getByTestId('accommodation-short-burst'));
    fireEvent.press(screen.getByTestId('accommodation-continue'));

    expect(alertSpy).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
