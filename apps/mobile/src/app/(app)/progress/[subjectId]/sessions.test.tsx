import { act, render, screen, fireEvent } from '@testing-library/react-native';

import SubjectSessionsScreen from './sessions';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'progress.subjectSessions.title': 'Past conversations',
        'progress.subjectSessions.empty': 'No conversations yet',
        'progress.subjectSessions.untitledTopic': 'Untitled topic',
        'progress.subjectSessions.openSessionFrom':
          'Open session from {{date}}',
        'progress.subjectSessions.loadingTooLong': 'Still loading…',
        'progress.subjectSessions.loadingMessage':
          'This is taking longer than usual.',
        'recaps.emptyCtaStartSession': 'Start a session',
        'common.tryAgain': 'Try Again',
        'common.goBack': 'Go back',
      };
      const template = map[key];
      if (!template) return key;
      if (!opts) return template;
      return Object.entries(opts).reduce(
        (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
        template,
      );
    },
  }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: mockBack,
  canGoBack: mockCanGoBack,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ subjectId: 's1' }),
  useRouter: () => mockRouter,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// components/common — real implementation: ErrorFallback uses only React
// Native primitives + useTranslation (mocked per-file above). The testIDs
// are forwarded through primaryAction.testID / secondaryAction.testID
// exactly as in the real component so no behaviour is lost.

// lib/format-relative-date — real implementation: pure date-math, no native
// or network dependency.

// lib/format-api-error — real implementation: classifyApiError calls
// i18next.t() which is initialised with the full en.json catalog in
// test-setup.ts so it returns real English strings in every test worker.

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../../lib/navigation' /* gc1-allow: goBackOrReplace calls router.back which requires native navigation context */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockUseSubjectSessions = jest.fn();
jest.mock(
  '../../../../hooks/use-subject-sessions' /* gc1-allow: transport-boundary — hook wraps useApiClient Hono RPC; requires mock fetch in unit tests */,
  () => ({
    useSubjectSessions: (...args: unknown[]) => mockUseSubjectSessions(...args),
  }),
);

const mockUseProgressInventory = jest.fn();
jest.mock(
  '../../../../hooks/use-progress' /* gc1-allow: transport-boundary — hook wraps useApiClient Hono RPC; requires mock fetch in unit tests */,
  () => ({
    useProgressInventory: () => mockUseProgressInventory(),
  }),
);

const SAMPLE_SESSIONS = [
  {
    id: 'sess-1',
    topicId: 'topic-1',
    topicTitle: 'Fractions',
    bookId: 'book-1',
    bookTitle: 'Numbers',
    chapter: 'Chapter 1',
    sessionType: 'learning',
    durationSeconds: 600,
    createdAt: '2026-05-01T10:00:00.000Z',
  },
  {
    id: 'sess-2',
    topicId: null,
    topicTitle: null,
    bookId: null,
    bookTitle: null,
    chapter: null,
    sessionType: 'learning',
    durationSeconds: null,
    createdAt: '2026-04-30T08:00:00.000Z',
  },
];

const INVENTORY = {
  data: { subjects: [{ subjectId: 's1', subjectName: 'Math' }] },
};

describe('SubjectSessionsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
    mockGoBackOrReplace.mockClear();
    mockCanGoBack.mockReturnValue(false);
    mockUseProgressInventory.mockReturnValue(INVENTORY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the loading skeleton while sessions load', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByTestId('subject-sessions-loading');
  });

  it('renders empty state when there are no sessions', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByTestId('subject-sessions-empty');
    screen.getByText('No conversations yet');
  });

  it('[BUG-679] empty state exposes a Start-a-session CTA that keeps subject context', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    const cta = screen.getByTestId('subject-sessions-empty-start');
    fireEvent.press(cta);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 's1',
        subjectName: 'Math',
      },
    });
  });

  it('renders error state with retry that calls refetch', () => {
    const refetch = jest.fn();
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: new Error('boom'),
      refetch,
    });
    render(<SubjectSessionsScreen />);
    fireEvent.press(screen.getByTestId('subject-sessions-error-retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders one row per session and links to session-summary', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: SAMPLE_SESSIONS,
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByTestId('subject-session-sess-1');
    screen.getByTestId('subject-session-sess-2');
    screen.getByText('Fractions');
    // Null topicTitle falls back to "Untitled topic"
    screen.getByText('Untitled topic');

    fireEvent.press(screen.getByTestId('subject-session-sess-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: 'sess-1',
        subjectId: 's1',
        topicId: 'topic-1',
      },
    });
  });

  it('shows the subject name as subtitle', () => {
    mockUseSubjectSessions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      error: null,
      refetch: jest.fn(),
    });
    render(<SubjectSessionsScreen />);
    screen.getByText('Math');
    screen.getByText('Past conversations');
  });

  describe('navigation -- deep-link fallback (BUG-686)', () => {
    it('[BUG-686] header back routes to subject parent, not tab root', () => {
      mockUseSubjectSessions.mockReturnValue({
        isLoading: false,
        isError: false,
        data: [],
        error: null,
        refetch: jest.fn(),
      });
      render(<SubjectSessionsScreen />);
      fireEvent.press(screen.getByTestId('subject-sessions-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        mockRouter,
        '/(app)/progress/s1',
      );
    });

    it('[BUG-686] error state Go Back routes to subject parent', () => {
      mockUseSubjectSessions.mockReturnValue({
        isLoading: false,
        isError: true,
        data: undefined,
        error: new Error('boom'),
        refetch: jest.fn(),
      });
      render(<SubjectSessionsScreen />);
      fireEvent.press(screen.getByTestId('subject-sessions-error-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        mockRouter,
        '/(app)/progress/s1',
      );
    });

    it('[BUG-686] timeout state Go Back routes to subject parent', () => {
      jest.useFakeTimers();
      mockUseSubjectSessions.mockReturnValue({
        isLoading: true,
        isError: false,
        data: undefined,
        error: null,
        refetch: jest.fn(),
      });
      render(<SubjectSessionsScreen />);
      // Source threshold is 15_000ms; assert just past the boundary so the
      // test pins the actual cutoff and a regression to a slower threshold
      // (e.g. 20s) would fail here.
      act(() => {
        jest.advanceTimersByTime(15_001);
      });
      fireEvent.press(screen.getByTestId('subject-sessions-timeout-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        mockRouter,
        '/(app)/progress/s1',
      );
    });

    it('[BUG-686] timeout state Retry calls refetch and clears the timeout', () => {
      jest.useFakeTimers();
      const refetch = jest.fn();
      mockUseSubjectSessions.mockReturnValue({
        isLoading: true,
        isError: false,
        data: undefined,
        error: null,
        refetch,
      });
      render(<SubjectSessionsScreen />);
      act(() => {
        jest.advanceTimersByTime(15_001);
      });
      screen.getByTestId('subject-sessions-timeout');
      fireEvent.press(screen.getByTestId('subject-sessions-timeout-retry'));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('[BUG-686] timeout does NOT fire below the 15s threshold', () => {
      jest.useFakeTimers();
      mockUseSubjectSessions.mockReturnValue({
        isLoading: true,
        isError: false,
        data: undefined,
        error: null,
        refetch: jest.fn(),
      });
      render(<SubjectSessionsScreen />);
      act(() => {
        jest.advanceTimersByTime(14_999);
      });
      expect(screen.queryByTestId('subject-sessions-timeout')).toBeNull();
      screen.getByTestId('subject-sessions-loading');
    });
  });
});
