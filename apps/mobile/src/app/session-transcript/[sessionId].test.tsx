// [BUG-889] Test the transcript view: learner can read past chat messages
// in chronological order. Before this screen existed there was no UI path
// from /session-summary/<id> back to the actual conversation, even though
// the API has always returned the exchanges via GET /sessions/:id/transcript.
import { render, screen, fireEvent } from '@testing-library/react-native';

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

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    primary: '#00b4d8',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textInverse: '#ffffff',
    danger: '#ef4444',
  }),
}));

jest.mock('../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

jest.mock('../../lib/format-api-error', () => ({
  formatApiError: (e: unknown) =>
    e instanceof Error ? e.message : 'Could not load',
}));

jest.mock('../../hooks/use-sessions', () => ({
  useSessionTranscript: () => mockTranscriptResult,
}));

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
});
