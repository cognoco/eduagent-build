// [BUG-889] Test the transcript view: learner can read past chat messages
// in chronological order. Before this screen existed there was no UI path
// from /session-summary/<id> back to the actual conversation, even though
// the API has always returned the exchanges via GET /sessions/:id/transcript.
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';

const mockUseLocalSearchParams = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
let mockTranscriptResult: {
  data?: unknown;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => void;
} = {
  data: undefined,
  isLoading: true,
  isError: false,
  refetch: jest.fn(),
};

// [BUG-134] Test override: stub Redirect so we can assert when the auth
// gate fires without pulling in the real expo-router navigation context.
// Default isSignedIn: true here so the existing transcript-rendering tests
// keep passing; the deep-link-without-auth break test below flips it.
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>redirect:{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../lib/theme',
  /* gc1-allow: native-boundary: theme hook requires native ColorScheme unavailable in JSDOM */ () => ({
    useThemeColors: () => ({
      primary: '#00b4d8',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
      textInverse: '#ffffff',
      danger: '#ef4444',
    }),
  }),
);

// navigation.ts is a pure utility (no native deps). Use the real module with
// a spy on goBackOrReplace so tests can assert the route argument passed by the screen.
const navigationModule = jest.requireActual<
  typeof import('../../lib/navigation')
>('../../lib/navigation');
jest
  .spyOn(navigationModule, 'goBackOrReplace')
  .mockImplementation((...args: unknown[]) => mockGoBackOrReplace(...args));
jest.mock(
  '../../lib/navigation' /* gc1-allow: requireActual passthrough — needed for spyOn to intercept goBackOrReplace */,
  () => jest.requireActual('../../lib/navigation'),
);

// format-api-error is a pure utility — real i18n initialized in test-setup.ts with English
// catalog. Use requireActual so the full classification logic runs in tests.
jest.mock(
  '../../lib/format-api-error' /* gc1-allow: requireActual passthrough — pure utility, real classification logic needed */,
  () => jest.requireActual('../../lib/format-api-error'),
);

jest.mock(
  '../../hooks/use-sessions',
  /* gc1-allow: transport-boundary: hook calls useApiClient which requires real HTTP transport */ () => ({
    useSessionTranscript: () => mockTranscriptResult,
  }),
);

const { default: SessionTranscriptScreen } = require('./[sessionId]');

describe('SessionTranscriptScreen [BUG-889]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ sessionId: 'sess-123' });
    mockTranscriptResult = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    };
    // [BUG-134] default to signed-in for all transcript tests; deep-link
    // gate test overrides this below.
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  it('shows the loading state while transcript is fetching', () => {
    render(<SessionTranscriptScreen />);
    screen.getByTestId('session-transcript-loading');
  });

  it('renders an actionable error fallback on transcript error', () => {
    mockTranscriptResult = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: jest.fn(),
    };
    render(<SessionTranscriptScreen />);
    screen.getByTestId('session-transcript-error');
    screen.getByTestId('session-transcript-retry');
    screen.getByTestId('session-transcript-error-back');
  });

  it('renders an empty state when there are no exchanges', () => {
    mockTranscriptResult = {
      data: {
        archived: false,
        session: {
          sessionId: 'sess-123',
          subjectId: 's',
          topicId: null,
          sessionType: 'learning',
          startedAt: '2026-04-30T10:00:00Z',
          exchangeCount: 0,
          milestonesReached: [],
        },
        exchanges: [],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    render(<SessionTranscriptScreen />);
    screen.getByTestId('session-transcript-empty');
  });

  it('renders the archived transcript card when the transcript has been purged', () => {
    mockTranscriptResult = {
      data: {
        archived: true,
        archivedAt: '2026-03-12T10:00:00.000Z',
        summary: {
          narrative:
            'Worked through long division and remainders by naming each step together.',
          topicsCovered: ['long division', 'remainders'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Try a 4-digit dividend with a remainder on the next session.',
          learnerRecap:
            'Today you connected division and remainders with solid progress.',
          topicId: null,
        },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };

    render(<SessionTranscriptScreen />);
    screen.getByTestId('archived-transcript-card');
    screen.getByText(/archived on/i);
  });

  it('renders user and assistant exchanges in order, hiding system-prompt rows', () => {
    mockTranscriptResult = {
      data: {
        archived: false,
        session: {
          sessionId: 'sess-123',
          subjectId: 's',
          topicId: null,
          sessionType: 'learning',
          startedAt: '2026-04-30T10:00:00Z',
          exchangeCount: 2,
          milestonesReached: [],
        },
        exchanges: [
          {
            role: 'assistant',
            content: '__SYSTEM_PROMPT__',
            timestamp: '2026-04-30T10:00:00Z',
            isSystemPrompt: true,
          },
          {
            role: 'user',
            content: 'Hello, can you teach me fractions?',
            timestamp: '2026-04-30T10:00:30Z',
          },
          {
            role: 'assistant',
            content: 'Of course — let us start with halves.',
            timestamp: '2026-04-30T10:00:45Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    render(<SessionTranscriptScreen />);

    screen.getByTestId('session-transcript-screen');
    screen.getByText('Hello, can you teach me fractions?');
    screen.getByText('Of course — let us start with halves.');
    // System-prompt row must NOT leak through.
    expect(screen.queryByText('__SYSTEM_PROMPT__')).toBeNull();
    screen.getByText('2 messages');

    // [BUG-889] Break test: visible user/assistant rows must each get an
    // exchange testID so the rendered tree is observable in regression tests.
    screen.getByTestId('transcript-exchange-0');
    screen.getByTestId('transcript-exchange-1');
  });

  it('falls back gracefully when sessionId param is missing', () => {
    mockUseLocalSearchParams.mockReturnValue({ sessionId: undefined });
    render(<SessionTranscriptScreen />);
    screen.getByTestId('session-transcript-no-id');
  });

  it('Back button routes to library', () => {
    mockTranscriptResult = {
      data: {
        archived: false,
        session: {
          sessionId: 'sess-123',
          subjectId: 's',
          topicId: null,
          sessionType: 'learning',
          startedAt: '2026-04-30T10:00:00Z',
          exchangeCount: 1,
          milestonesReached: [],
        },
        exchanges: [
          {
            role: 'user',
            content: 'Hi',
            timestamp: '2026-04-30T10:00:30Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    render(<SessionTranscriptScreen />);

    fireEvent.press(screen.getByTestId('session-transcript-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/library',
    );
  });

  // -------------------------------------------------------------------------
  // [BUG-941] Defense-in-depth: render-boundary envelope stripping
  // -------------------------------------------------------------------------
  describe('envelope stripping [BUG-941]', () => {
    // The full envelope shape the server produces (mirrors the exact fixture
    // from strip-envelope.test.ts to keep the regression story consistent).
    const LEAKED_ENVELOPE =
      '{"reply":"Very close! The letters \'gi\' together make a \'j\' sound, like in \'jungle\'. So it\'s \'Buon-JOR-noh\'. Try saying \'Buongiorno\' one more time.","signals":{"partial_progress":true,"needs_deepening":false,"understanding_check":false},"ui_hints":{"note_prompt":{"show":false,"post_session":false},"fluency_drill":{"active":false,"duration_s":0,"score":{"correct":0,"total":0}}}}';

    const STRIPPED_REPLY =
      "Very close! The letters 'gi' together make a 'j' sound, like in 'jungle'. So it's 'Buon-JOR-noh'. Try saying 'Buongiorno' one more time.";

    function makeTranscript(
      exchanges: {
        role: string;
        content: string;
        timestamp: string;
        isSystemPrompt?: boolean;
      }[],
    ) {
      return {
        data: {
          archived: false,
          session: {
            sessionId: 'sess-envelope',
            subjectId: 's',
            topicId: null,
            sessionType: 'learning',
            startedAt: '2026-04-30T10:00:00Z',
            exchangeCount: exchanges.filter((e) => !e.isSystemPrompt).length,
            milestonesReached: [],
          },
          exchanges,
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }

    it('strips a leaked envelope JSON blob from an assistant exchange before rendering', () => {
      mockTranscriptResult = makeTranscript([
        {
          role: 'user',
          content: 'Can you say Buongiorno?',
          timestamp: '2026-04-30T10:01:00Z',
        },
        {
          role: 'assistant',
          content: LEAKED_ENVELOPE,
          timestamp: '2026-04-30T10:01:05Z',
        },
      ]);
      render(<SessionTranscriptScreen />);

      // The clean reply must be visible.
      screen.getByText(STRIPPED_REPLY);

      // The raw JSON blob must NOT appear anywhere on screen.
      expect(screen.queryByText(LEAKED_ENVELOPE)).toBeNull();
      // Guard against partial leakage of the JSON structure keys.
      expect(screen.queryByText(/ui_hints/)).toBeNull();
      expect(screen.queryByText(/signals/)).toBeNull();
    });

    it('does NOT strip a user-role exchange whose content looks like JSON — negative case', () => {
      // A learner could paste a JSON object or code snippet. We must NOT mangle it.
      const userJson =
        '{"reply":"I think the answer is 42","signals":{"partial_progress":false}}';
      mockTranscriptResult = makeTranscript([
        {
          role: 'user',
          content: userJson,
          timestamp: '2026-04-30T10:02:00Z',
        },
        {
          role: 'assistant',
          content: 'Interesting paste!',
          timestamp: '2026-04-30T10:02:05Z',
        },
      ]);
      render(<SessionTranscriptScreen />);

      // User content must appear verbatim — no stripping.
      screen.getByText(userJson);
      // The assistant plain-text message also passes through unchanged.
      screen.getByText('Interesting paste!');
    });

    it('renders plain-text assistant content unchanged when no envelope is present', () => {
      mockTranscriptResult = makeTranscript([
        {
          role: 'assistant',
          content: 'Great work on fractions today!',
          timestamp: '2026-04-30T10:03:00Z',
        },
      ]);
      render(<SessionTranscriptScreen />);
      screen.getByText('Great work on fractions today!');
    });
  });

  // -------------------------------------------------------------------------
  // [BUG-152] Continue-topic CTA must push a typed (object) route, not a
  // string-templated one — the latter is fragile on web.
  // -------------------------------------------------------------------------
  describe('archived transcript continue-topic [BUG-152]', () => {
    it('pushes the typed object route shape, not a string-templated URL', () => {
      mockTranscriptResult = {
        data: {
          archived: true,
          archivedAt: '2026-03-12T10:00:00.000Z',
          summary: {
            narrative: 'A great session about fractions.',
            topicsCovered: ['fractions'],
            sessionState: 'completed',
            reEntryRecommendation: 'Try fraction word problems next.',
            learnerRecap: 'Today you mastered fractions.',
            topicId: 'topic-xyz',
          },
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };

      render(<SessionTranscriptScreen />);
      fireEvent.press(screen.getByTestId('archived-continue-topic-cta'));

      expect(mockPush).toHaveBeenCalledTimes(1);
      // [BUG-522] Must navigate to '/(app)/session' (canonical session-entry
      // route matching topic/[topicId].tsx pattern). '/(app)/session/start'
      // does not exist and causes a silent Expo Router 404.
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: { mode: 'learning', topicId: 'topic-xyz' },
      });
      // Break-test guard: must NOT use the nonexistent /session/start route.
      expect(mockPush).not.toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/(app)/session/start' }),
      );
      // Break-test guard: must NOT be a string template.
      expect(mockPush).not.toHaveBeenCalledWith(expect.any(String));
    });
  });

  // -------------------------------------------------------------------------
  // [BUG-134] Auth gate — deep-link entry to root-level screen
  // -------------------------------------------------------------------------
  describe('auth gate [BUG-134]', () => {
    it('redirects to /sign-in when an unauthenticated user opens a transcript deep-link', () => {
      // Break test: this route lives at the project root (not under (app)/),
      // so the (app) layout's auth guard does not run. Without the in-screen
      // guard the unauthenticated user would hit a permanent loading spinner.
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: false,
      });

      render(<SessionTranscriptScreen />);

      screen.getByTestId('mock-redirect-/sign-in');
      // The transcript loading / error UI must NOT render — the screen
      // must short-circuit to the redirect before any data UI is reached.
      expect(screen.queryByTestId('session-transcript-loading')).toBeNull();
      expect(screen.queryByTestId('session-transcript-error')).toBeNull();
    });

    it('shows a spinner (not redirect) while Clerk is still hydrating', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: false,
        isSignedIn: false,
      });

      render(<SessionTranscriptScreen />);
      screen.getByTestId('session-transcript-auth-loading');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [BUG-142] Loading timeout — escape hatch from unbounded spinner
  // -------------------------------------------------------------------------
  describe('loading timeout [BUG-142]', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows a Retry + Back action after the 15s timeout window elapses', () => {
      jest.useFakeTimers();
      mockTranscriptResult = {
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: jest.fn(),
      };

      render(<SessionTranscriptScreen />);
      // Spinner first
      screen.getByTestId('session-transcript-loading');

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      // After 15s the loader must flip to the actionable fallback.
      screen.getByTestId('session-transcript-timeout-retry');
      screen.getByTestId('session-transcript-timeout-back');
    });
  });
});
