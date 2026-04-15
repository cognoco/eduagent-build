import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockMutateAsync = jest.fn();
let mockIsPending = false;
let mockSubjectId: string | undefined = 'test-id';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
  }),
  useLocalSearchParams: () => ({
    languageCode: 'es',
    languageName: 'Spanish',
    subjectId: mockSubjectId,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#94a3b8',
    textInverse: '#ffffff',
    textSecondary: '#64748b',
  }),
}));

jest.mock('../../../hooks/use-subjects', () => ({
  useConfigureLanguageSubject: () => ({
    mutateAsync: mockMutateAsync,
    isPending: mockIsPending,
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: jest.fn(),
}));

const LanguageSetup = require('./language-setup').default;

describe('LanguageSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjectId = 'test-id';
    mockIsPending = false;
    mockMutateAsync.mockResolvedValue({ subject: { id: 'test-id' } });
  });

  // --- existing happy-path tests ---

  it('renders language confirmation card', () => {
    render(<LanguageSetup />);
    expect(
      screen.getByText(/Looks like you're learning Spanish!/i)
    ).toBeTruthy();
    expect(screen.getByText(/language-focused approach/i)).toBeTruthy();
  });

  it('renders level selection options', () => {
    render(<LanguageSetup />);
    expect(screen.getByText(/Complete beginner/i)).toBeTruthy();
    expect(screen.getByText(/I know some basics/i)).toBeTruthy();
    expect(screen.getByText(/Conversational/i)).toBeTruthy();
    expect(screen.getByText(/Advanced/i)).toBeTruthy();
  });

  it('lets the learner choose a native language', () => {
    render(<LanguageSetup />);
    fireEvent.press(screen.getByTestId('native-language-fr'));
    expect(screen.getByTestId('native-language-fr')).toBeTruthy();
  });

  // --- error scenario tests ---

  it('shows "No language subject selected" when subjectId is missing', () => {
    mockSubjectId = undefined;
    render(<LanguageSetup />);
    expect(screen.getByText(/No language subject selected/i)).toBeTruthy();
  });

  it('shows validation error for "Other" language without custom input and does not call mutateAsync', async () => {
    render(<LanguageSetup />);

    fireEvent.press(screen.getByTestId('native-language-other'));
    // The custom input appears; leave it empty and press Continue
    fireEvent.press(screen.getByTestId('language-setup-continue'));

    await waitFor(() => {
      expect(
        screen.getByText(/Please type your native language\./i)
      ).toBeTruthy();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows network error message when mutateAsync rejects with a TypeError', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new TypeError('Network request failed')
    );

    render(<LanguageSetup />);
    fireEvent.press(screen.getByTestId('language-setup-continue'));

    await waitFor(() => {
      expect(screen.getByText(/Looks like you're offline/i)).toBeTruthy();
    });
  });

  it('shows server error message when mutateAsync rejects with a 5xx error', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new Error('API error 500: Internal server error')
    );

    render(<LanguageSetup />);
    fireEvent.press(screen.getByTestId('language-setup-continue'));

    await waitFor(() => {
      expect(screen.getByText(/went wrong on our end/i)).toBeTruthy();
    });
  });

  it('disables Continue button and shows ActivityIndicator when isPending is true', () => {
    mockIsPending = true;
    render(<LanguageSetup />);

    const continueButton = screen.getByTestId('language-setup-continue');
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);
    // ActivityIndicator is rendered in place of the "Continue" text
    expect(screen.queryByText(/^Continue$/i)).toBeNull();
  });

  it('navigates to curriculum-review with subjectId after successful submit', async () => {
    mockMutateAsync.mockResolvedValueOnce({ subject: { id: 'test-id' } });

    render(<LanguageSetup />);
    fireEvent.press(screen.getByTestId('language-setup-continue'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/onboarding/curriculum-review',
          params: { subjectId: 'test-id' },
        })
      );
    });
  });
});
