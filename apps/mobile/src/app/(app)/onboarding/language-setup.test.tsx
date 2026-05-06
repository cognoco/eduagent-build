import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

// Translations table — mirrors what will be in en.json onboarding namespace once coordinator merges.
// Keeps tests asserting on real English strings rather than i18n keys.
const translations: Record<string, string> = {
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.done': 'Done',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.next': 'Next',
  'common.retry': 'Retry',
  'common.tryAgain': 'Try Again',
  'common.goBack': 'Go Back',
  'common.goHome': 'Go Home',
  'onboarding.languageSetup.title': 'Language setup',
  'onboarding.languageSetup.subtitle':
    "We'll switch this subject into a language-focused path with direct teaching, vocabulary tracking, and speaking practice.",
  'onboarding.languageSetup.learningHint':
    "Looks like you're learning {{language}}!",
  'onboarding.languageSetup.approachHint':
    "We'll use a language-focused approach built around vocabulary, fluency, input, and output practice.",
  'onboarding.languageSetup.noSubjectSelected': 'No language subject selected',
  'onboarding.languageSetup.nativeLanguageRequired':
    'Please type your native language.',
  'onboarding.languageSetup.nativeLanguageLabel': 'Your native language',
  'onboarding.languageSetup.nativeLanguagePlaceholder': 'Type your language',
  'onboarding.languageSetup.currentLevelLabel': 'Your current level',
  'onboarding.languageSetup.startsAround': 'Starts around {{level}}',
  'onboarding.languageSetup.levels.A1.label': 'Complete beginner',
  'onboarding.languageSetup.levels.A1.description':
    'Start from the foundations and build everyday basics.',
  'onboarding.languageSetup.levels.A2.label': 'I know some basics',
  'onboarding.languageSetup.levels.A2.description':
    'You can handle simple situations and want to grow range.',
  'onboarding.languageSetup.levels.B1.label': 'Conversational',
  'onboarding.languageSetup.levels.B1.description':
    'You can get by and want stronger fluency and precision.',
  'onboarding.languageSetup.levels.B2.label': 'Advanced',
  'onboarding.languageSetup.levels.B2.description':
    'You want more nuance, confidence, and flexible expression.',
  'onboarding.common.noSubjectSelected': 'No subject selected',
  'onboarding.common.saving': 'Saving…',
  'onboarding.common.skip': 'Skip',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      let val = translations[key] ?? key;
      if (opts) {
        Object.entries(opts).forEach(([k, v]) => {
          val = val.replace(`{{${k}}}`, String(v));
        });
      }
      return val;
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

const mockReplace = jest.fn();
const mockMutateAsync = jest.fn();
const mockStartFirstCurriculumMutateAsync = jest.fn();
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

jest.mock('../../../hooks/use-sessions', () => ({
  useStartFirstCurriculumSession: () => ({
    mutateAsync: mockStartFirstCurriculumMutateAsync,
    isPending: false,
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../../lib/feature-flags', () => ({
  FEATURE_FLAGS: {
    ONBOARDING_FAST_PATH: false,
    COACH_BAND_ENABLED: true,
    MIC_IN_PILL_ENABLED: true,
    I18N_ENABLED: true,
  },
}));

const { FEATURE_FLAGS } = require('../../../lib/feature-flags');
const LanguageSetup = require('./language-setup').default;

describe('LanguageSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjectId = 'test-id';
    mockIsPending = false;
    mockMutateAsync.mockResolvedValue({ subject: { id: 'test-id' } });
    mockStartFirstCurriculumMutateAsync.mockResolvedValue({
      session: {
        id: 'session-1',
        topicId: 'topic-1',
      },
    });
    FEATURE_FLAGS.ONBOARDING_FAST_PATH = false;
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

  it('routes to session when ONBOARDING_FAST_PATH is true', async () => {
    FEATURE_FLAGS.ONBOARDING_FAST_PATH = true;

    render(<LanguageSetup />);

    fireEvent.press(screen.getByTestId('language-setup-continue'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: 'test-id',
          sessionId: 'session-1',
          topicId: 'topic-1',
          subjectName: 'Spanish',
        },
      });
    });
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/onboarding/accommodations',
      })
    );
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
