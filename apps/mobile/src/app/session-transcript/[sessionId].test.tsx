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
    expect(screen.getByTestId('session-transcript-loading')).toBeTruthy();
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
    expect(screen.getByTestId('session-transcript-error')).toBeTruthy();
    expect(screen.getByTestId('session-transcript-retry')).toBeTruthy();
    expect(screen.getByTestId('session-transcript-error-back')).toBeTruthy();
  });

  it('renders an empty state when there are no exchanges', () => {
    mockTranscriptResult = {
      data: {
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
    expect(screen.getByTestId('session-transcript-empty')).toBeTruthy();
  });

  it('renders user and assistant exchanges in order, hiding system-prompt rows', () => {
    mockTranscriptResult = {
      data: {
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

    expect(screen.getByTestId('session-transcript-screen')).toBeTruthy();
    expect(screen.getByText('Hello, can you teach me fractions?')).toBeTruthy();
    expect(
      screen.getByText('Of course — let us start with halves.')
    ).toBeTruthy();
    // System-prompt row must NOT leak through.
    expect(screen.queryByText('__SYSTEM_PROMPT__')).toBeNull();
    expect(screen.getByText('2 messages')).toBeTruthy();

    // [BUG-889] Break test: visible user/assistant rows must each get an
    // exchange testID so the rendered tree is observable in regression tests.
    expect(screen.getByTestId('transcript-exchange-0')).toBeTruthy();
    expect(screen.getByTestId('transcript-exchange-1')).toBeTruthy();
  });

  it('falls back gracefully when sessionId param is missing', () => {
    mockUseLocalSearchParams.mockReturnValue({ sessionId: undefined });
    render(<SessionTranscriptScreen />);
    expect(screen.getByTestId('session-transcript-no-id')).toBeTruthy();
  });

  it('Back button routes to library', () => {
    mockTranscriptResult = {
      data: {
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
      '/(app)/library'
    );
  });
});
