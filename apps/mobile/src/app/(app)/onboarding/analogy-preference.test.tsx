import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockMutate = jest.fn();
let mockIsPending = false;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    subjectId: 'subject-1',
    subjectName: 'History',
    step: '2',
    totalSteps: '4',
  }),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/use-settings', () => ({
  useUpdateAnalogyDomain: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

const AnalogyPreferenceScreen = require('./analogy-preference').default;

describe('AnalogyPreferenceScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPending = false;
  });

  it('renders the title and onboarding step indicator', () => {
    render(<AnalogyPreferenceScreen />);

    screen.getByText('How do you like things explained?');
    screen.getByText('Step 2 of 4');
  });

  it('navigates back to interview with full params', () => {
    render(<AnalogyPreferenceScreen />);

    fireEvent.press(screen.getByTestId('analogy-back-button'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pathname: '/(app)/onboarding/interview',
        params: {
          subjectId: 'subject-1',
          subjectName: 'History',
          step: '1',
          totalSteps: '4',
        },
      })
    );
  });

  it('navigates to accommodations when skip is pressed', () => {
    render(<AnalogyPreferenceScreen />);

    fireEvent.press(screen.getByTestId('analogy-skip-button'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/accommodations',
      params: {
        subjectId: 'subject-1',
        subjectName: 'History',
        step: '3',
        totalSteps: '4',
      },
    });
  });

  it('navigates to accommodations when continue is pressed without selection', () => {
    render(<AnalogyPreferenceScreen />);

    fireEvent.press(screen.getByTestId('analogy-continue-button'));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/accommodations',
      params: {
        subjectId: 'subject-1',
        subjectName: 'History',
        step: '3',
        totalSteps: '4',
      },
    });
  });

  it('saves the domain and navigates to accommodations', async () => {
    mockMutate.mockImplementation(
      (_domain: string, options: { onSuccess?: () => void }) => {
        options.onSuccess?.();
      }
    );

    render(<AnalogyPreferenceScreen />);

    fireEvent.press(screen.getByTestId('analogy-domain-cooking'));
    fireEvent.press(screen.getByTestId('analogy-continue-button'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        'cooking',
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/accommodations',
      params: {
        subjectId: 'subject-1',
        subjectName: 'History',
        step: '3',
        totalSteps: '4',
      },
    });
  });
});
