import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockMutateAsync = jest.fn();
const mockGoBackOrReplace = jest.fn();
let mockIsPending = false;
let mockSubjectId: string | undefined = 'test-id';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  }),
  useLocalSearchParams: () => ({
    languageCode: 'es',
    languageName: 'Spanish',
    subjectId: mockSubjectId,
    subjectName: 'Spanish',
    step: '2',
    totalSteps: '4',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#94a3b8',
    primary: '#00b4d8',
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
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

const LanguageSetup = require('./language-setup').default;

describe('LanguageSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjectId = 'test-id';
    mockIsPending = false;
    mockMutateAsync.mockResolvedValue({ subject: { id: 'test-id' } });
  });

  it('renders the onboarding step indicator', () => {
    render(<LanguageSetup />);

    screen.getByText('Step 2 of 4');
  });

  it('renders language confirmation card', () => {
    render(<LanguageSetup />);

    expect(
      screen.getByText(/Looks like you're learning Spanish!/i)
    ).toBeTruthy();
  });

  it('shows "No language subject selected" when subjectId is missing', () => {
    mockSubjectId = undefined;

    render(<LanguageSetup />);

    screen.getByText(/No language subject selected/i);
  });

  it('navigates back to interview with the full param shape', () => {
    render(<LanguageSetup />);

    fireEvent.press(screen.getByTestId('language-setup-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pathname: '/(app)/onboarding/interview',
        params: {
          subjectId: 'test-id',
          subjectName: 'Spanish',
          languageCode: 'es',
          languageName: 'Spanish',
          step: '1',
          totalSteps: '4',
        },
      })
    );
  });

  it('shows validation error for "Other" language without custom input', async () => {
    render(<LanguageSetup />);

    fireEvent.press(screen.getByTestId('native-language-other'));
    fireEvent.press(screen.getByTestId('language-setup-continue'));

    await waitFor(() => {
      expect(
        screen.getByText(/Please type your native language\./i)
      ).toBeTruthy();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('navigates to accommodations after successful submit', async () => {
    render(<LanguageSetup />);

    fireEvent.press(screen.getByTestId('language-setup-continue'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/onboarding/accommodations',
        params: {
          subjectId: 'test-id',
          subjectName: 'Spanish',
          languageCode: 'es',
          languageName: 'Spanish',
          step: '3',
          totalSteps: '4',
        },
      });
    });
  });

  it('disables Continue button and hides the label when pending', () => {
    mockIsPending = true;

    render(<LanguageSetup />);

    const continueButton = screen.getByTestId('language-setup-continue');
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByText(/^Continue$/i)).toBeNull();
  });

  it('[BUG-692-FOLLOWUP] router.replace does not fire when user presses Back during configureLanguageSubject', async () => {
    // Arrange: deferred mutation — stays pending until we resolve it.
    let resolveMutation!: (value: { subject: { id: string } }) => void;
    mockMutateAsync.mockReturnValue(
      new Promise<{ subject: { id: string } }>((resolve) => {
        resolveMutation = resolve;
      })
    );

    render(<LanguageSetup />);

    // Fire the mutation.
    fireEvent.press(screen.getByTestId('language-setup-continue'));

    // While mutation is in-flight, press Back (the bail-out).
    fireEvent.press(screen.getByTestId('language-setup-back'));

    // Resolve the mutation after back-navigation.
    resolveMutation({ subject: { id: 'test-id' } });

    // Allow microtasks to drain.
    await new Promise((r) => setTimeout(r, 0));

    // router.replace (navigation to accommodations) must NOT have been called —
    // only the goBackOrReplace from Back should have fired.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockGoBackOrReplace).toHaveBeenCalledTimes(1);
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pathname: '/(app)/onboarding/interview' })
    );
  });
});
