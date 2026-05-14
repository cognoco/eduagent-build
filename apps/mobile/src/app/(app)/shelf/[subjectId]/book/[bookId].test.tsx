import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  createTestProfile,
  cleanupScreen,
} from '../../../../../../test-utils/screen-render-harness';
import { createRouterMockFns } from '../../../../../test-utils/native-shims';

// ---------------------------------------------------------------------------
// Transport boundary — API client (transport-boundary)
// ---------------------------------------------------------------------------

const mockFetch = createRoutedMockFetch();

jest.mock('../../../../../lib/api-client', () => // gc1-allow: transport boundary — real hooks run against routedMockFetch
  require('../../../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

// ---------------------------------------------------------------------------
// Native boundary — expo-router (native-boundary)
// Params are mutable so per-test overrides can supply readOnly / autoStart.
// ---------------------------------------------------------------------------

const mockRouterFns = createRouterMockFns();
let mockCurrentParams: Record<string, string> = { subjectId: 'sub-1', bookId: 'book-1' };

jest.mock('expo-router', () => { // gc1-allow: native-boundary — Expo native module unavailable in Jest
  const { expoRouterShim: shim } = require('../../../../../test-utils/native-shims');
  // Delegate to shim but proxy params through the mutable mockCurrentParams ref
  const base = shim(mockRouterFns, {});
  return {
    ...base,
    useLocalSearchParams: () => mockCurrentParams,
    useGlobalSearchParams: () => mockCurrentParams,
    useRouter: () => mockRouterFns,
  };
});

// ---------------------------------------------------------------------------
// Native boundary — safe-area-context (native-boundary)
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => { // gc1-allow: native-boundary — safe area context requires native bindings
  const { safeAreaShim: shim } = require('../../../../../test-utils/native-shims');
  return shim();
});

// ---------------------------------------------------------------------------
// External boundary — react-i18next (external-boundary)
// ---------------------------------------------------------------------------

jest.mock('react-i18next', () => // gc1-allow: external-boundary — i18n provider not available in test runtime
  require('../../../../../test-utils/mock-i18n').i18nMock,
);

// ---------------------------------------------------------------------------
// Native boundary — theme (native-boundary: ColorScheme unavailable in JSDOM)
// ---------------------------------------------------------------------------

jest.mock('../../../../../lib/theme', () => ({ // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    accent: '#00bfa5',
    primary: '#0d9488',
    success: '#22c55e',
    danger: '#ef4444',
    textSecondary: '#888',
    textInverse: '#fff',
    surface: '#fff',
    border: '#ccc',
  }),
}));

// ---------------------------------------------------------------------------
// Native boundary — animation components (native-boundary: Reanimated + svg)
// ---------------------------------------------------------------------------

jest.mock('../../../../../components/common', () => ({ // gc1-allow: Reanimated worklets + react-native-svg cannot run in JSDOM
  BookPageFlipAnimation: () => null,
  MagicPenAnimation: () => null,
  CelebrationAnimation: () => null,
}));

// ---------------------------------------------------------------------------
// Native boundary — platform-alert (native-boundary: Alert is native)
// ---------------------------------------------------------------------------

jest.mock('../../../../../lib/platform-alert', () => ({ // gc1-allow: native-boundary — Alert.alert requires native module
  platformAlert: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Default API route fixtures (overridden per-test via mockFetch.setRoute)
// ---------------------------------------------------------------------------

function makeDefaultRoutes() {
  mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
    sessions: [],
  });
  mockFetch.setRoute('subjects/sub-1/books/book-1/notes', {
    notes: [],
  });
  mockFetch.setRoute('subjects/sub-1/books/book-1', {
    book: {
      id: 'book-1',
      title: 'Algebra',
      emoji: '📐',
      topicsGenerated: true,
      description: 'Basic algebra',
    },
    topics: [
      {
        id: 'topic-1',
        title: 'Linear Equations',
        sortOrder: 1,
        skipped: false,
        chapter: 'Foundations',
      },
      {
        id: 'topic-2',
        title: 'Quadratic Equations',
        sortOrder: 2,
        skipped: false,
        chapter: 'Foundations',
      },
    ],
    completedTopicCount: 0,
  });
  mockFetch.setRoute('subjects/sub-1/books', {
    books: [
      { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
      { id: 'book-2', title: 'Geometry', emoji: '📏', topicsGenerated: true },
    ],
  });
  mockFetch.setRoute('subjects/sub-1/retention', {
    topics: [],
    reviewDueCount: 0,
  });
  mockFetch.setRoute('subjects/sub-1/curriculum', {
    curriculum: null,
  });
  mockFetch.setRoute('progress/resume-target', {
    target: null,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTopic(overrides: Record<string, unknown> = {}) {
  return {
    id: 'topic-1',
    title: 'Linear Equations',
    sortOrder: 1,
    skipped: false,
    chapter: null,
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    topicId: 'topic-1',
    topicTitle: 'Linear Equations',
    chapter: 'Foundations',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRetentionTopic(overrides: Record<string, unknown> = {}) {
  return {
    topicId: 'topic-1',
    repetitions: 1,
    easeFactor: 2.5,
    xpStatus: 'active',
    failureCount: 0,
    nextReviewAt: null,
    daysSinceLastReview: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Import the screen AFTER all mocks are declared
// ---------------------------------------------------------------------------

const BookScreen = require('./[bookId]').default;

// ---------------------------------------------------------------------------
// Shared wrapper factory
// ---------------------------------------------------------------------------

function makeWrapper() {
  const owner = createTestProfile({ id: 'p1', displayName: 'Alex', isOwner: true });
  return createScreenWrapper({ activeProfile: owner, profiles: [owner] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentParams = { subjectId: 'sub-1', bookId: 'book-1' };
    mockRouterFns.canGoBack.mockReturnValue(true);
    makeDefaultRoutes();
  });

  afterEach(async () => {
    const { queryClient } = makeWrapper();
    await cleanupScreen(queryClient);
  });

  it('renders the loading state', async () => {
    // Return loading by never resolving the book query
    mockFetch.setRoute('subjects/sub-1/books/book-1', () => new Promise(() => { /* never resolves */ }));

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    // New book screen shows a shimmer skeleton during loading, not a text label
    getByTestId('book-loading');
  });

  it('keeps cached book content visible during a background refetch', async () => {
    const { wrapper } = makeWrapper();
    const { getByTestId, queryByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    getByText('Algebra');
    getByTestId('up-next-row-topic-1');
    expect(queryByTestId('book-loading')).toBeNull();
  });

  it('keeps cached book content visible if a background refresh errors', async () => {
    const { wrapper } = makeWrapper();
    const { getByTestId, queryByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    getByText('Algebra');
    expect(queryByTestId('book-error')).toBeNull();
  });

  it('shows the error state and wires retry plus back', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', new Response(JSON.stringify({ error: 'Server exploded' }), { status: 500 }));

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-error'));
    // The assertOk-based error surfacing renders an error message
    getByTestId('book-error');

    fireEvent.press(getByTestId('book-retry-button'));
    fireEvent.press(getByTestId('book-back-button'));

    expect(mockRouterFns.replace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('shows missing-param guidance when route params are incomplete', () => {
    mockCurrentParams = { subjectId: '', bookId: 'book-1' };

    const { wrapper } = makeWrapper();
    const { getByTestId, getByText } = render(<BookScreen />, { wrapper });

    getByTestId('book-missing-param');
    expect(
      getByText('Missing book details. Please go back and try again.'),
    ).toBeTruthy();
  });

  it('[BUG-636 / M-4] missing-param "Go back" button navigates somewhere instead of being a silent no-op', () => {
    // Before the fix, handleBack early-returned when subjectId was missing,
    // leaving the user trapped on the error screen with a button that did
    // nothing.
    mockCurrentParams = { subjectId: '', bookId: 'book-1' };
    mockRouterFns.canGoBack.mockReturnValue(false);

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });
    fireEvent.press(getByTestId('book-missing-param-back'));

    // Either back() or replace() must have been invoked — anything other than
    // a silent no-op. With canGoBack=false (deep-link entry), goBackOrReplace
    // falls back to /(app)/library.
    const totalNavCalls =
      mockRouterFns.back.mock.calls.length + mockRouterFns.replace.mock.calls.length;
    expect(totalNavCalls).toBeGreaterThan(0);
    expect(mockRouterFns.replace).toHaveBeenCalledWith('/(app)/library');
  });

  it('[BUG-798 / F-NAV-05] missing bookId only — fallback navigates to subject shelf', () => {
    // Symmetry test for BUG-798: the missing-param guard is `!subjectId ||
    // !bookId`, but handleBack branches on subjectId. When ONLY bookId is
    // missing (subjectId still present), the user must reach the subject
    // shelf, not be left stranded. The previous bug report flagged that
    // bookId was "not equally guarded" — this locks the symmetric path.
    mockCurrentParams = { subjectId: 'sub-1', bookId: '' };

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });
    fireEvent.press(getByTestId('book-missing-param-back'));

    expect(mockRouterFns.replace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('[BUG-798 / F-NAV-05] missing both params — fallback to library, never silent no-op', () => {
    // Worst case: deep link drops both segments. Must still escape to a
    // working surface (library), not the dreaded silent dead-end.
    mockCurrentParams = { subjectId: '', bookId: '' };
    mockRouterFns.canGoBack.mockReturnValue(false);

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });
    fireEvent.press(getByTestId('book-missing-param-back'));

    const totalNavCalls =
      mockRouterFns.back.mock.calls.length + mockRouterFns.replace.mock.calls.length;
    expect(totalNavCalls).toBeGreaterThan(0);
    expect(mockRouterFns.replace).toHaveBeenCalledWith('/(app)/library');
  });

  it('renders the compact header on the main view', async () => {
    const { wrapper } = makeWrapper();
    const { getByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    // New book screen: compact header shows book title and topics progress.
    // Subject name and session count are no longer in the header — these were
    // removed during the Library v3 redesign.
    getByText('Algebra');
    getByText('0 of 2 topics finished');
  });

  it('derives header progress from retention topics', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics: [
        makeTopic({ id: 'topic-1', title: 'T1', sortOrder: 1 }),
        makeTopic({ id: 'topic-2', title: 'T2', sortOrder: 2 }),
        makeTopic({ id: 'topic-3', title: 'T3', sortOrder: 3 }),
      ],
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/retention', {
      topics: [
        makeRetentionTopic({ topicId: 'topic-1' }),
        makeRetentionTopic({ topicId: 'topic-2' }),
      ],
      reviewDueCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByText('2 of 3 topics finished'));
  });

  it('shows elapsed retention days in the book header when available', async () => {
    mockFetch.setRoute('subjects/sub-1/retention', {
      topics: [
        makeRetentionTopic({
          topicId: 'topic-1',
          nextReviewAt: '2099-01-01T00:00:00.000Z',
          daysSinceLastReview: 9,
        }),
      ],
      reviewDueCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByText('Remembered after 9 days'));
  });

  it('offers to set up a fuller topic list when a book only has one starter topic', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Introduction to Programming', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics: [
        makeTopic({ id: 'topic-1', title: 'Introduction to Programming', sortOrder: 1 }),
      ],
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/sessions/first-curriculum', {
      session: { id: 'session-1', topicId: 'topic-1' },
    });

    const { wrapper } = makeWrapper();
    const { getByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-thin-path-card'));
    getByText('Create a fuller topic list');

    fireEvent.press(getByTestId('book-thin-path-build'));

    await waitFor(() => {
      expect(mockRouterFns.push).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'sub-1',
          bookId: 'book-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          subjectName: 'Introduction to Programming',
        }),
      });
    });
  });

  it('renders continue now and started from in-progress sessions', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics: [
        makeTopic({ id: 'topic-1', title: 'Linear Equations', sortOrder: 1 }),
        makeTopic({ id: 'topic-2', title: 'Quadratic Equations', sortOrder: 2 }),
        makeTopic({ id: 'topic-3', title: 'Functions', sortOrder: 3 }),
      ],
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
      sessions: [
        makeSession({ id: 'sess-1', topicId: 'topic-1', topicTitle: 'Linear Equations', createdAt: '2026-04-24T12:00:00.000Z' }),
        makeSession({ id: 'sess-2', topicId: 'topic-2', topicTitle: 'Quadratic Equations', createdAt: '2026-04-24T10:00:00.000Z' }),
        makeSession({ id: 'sess-3', topicId: 'topic-2', topicTitle: 'Quadratic Equations', createdAt: '2026-04-24T09:00:00.000Z' }),
      ],
    });

    const { wrapper } = makeWrapper();
    const { getByTestId, queryByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    // [BUG-895] The "Continue now" in-list row was removed in favour of the
    // sticky "▶ Continue: <title>" CTA at the bottom of the screen. The
    // started topic still surfaces in its own section.
    expect(queryByTestId('continue-now-row')).toBeNull();
    getByTestId('started-row-topic-2');
    getByText('2 sessions');
    // Sticky CTA names the continue topic explicitly.
    getByText('▶ Continue: Linear Equations');

    fireEvent.press(getByTestId('book-start-learning'));
    expect(mockRouterFns.push).toHaveBeenCalledWith({
      pathname: '/(app)/topic/[topicId]',
      params: { topicId: 'topic-1', subjectId: 'sub-1', bookId: 'book-1' },
    });
  });

  it('renders all started topics inline without an overflow control', async () => {
    // The library-redesign removed the "started" overflow/show-more control.
    // All started topics now render immediately inside the chapter-grouped
    // topic list with no truncation or expand affordance.
    const topics = Array.from({ length: 6 }, (_, index) =>
      makeTopic({
        id: `topic-${index + 1}`,
        title: `Topic ${index + 1}`,
        sortOrder: index + 1,
      }),
    );
    const sessions = topics.map((topic, index) =>
      makeSession({
        id: `sess-${index + 1}`,
        topicId: topic.id,
        topicTitle: topic.title,
        createdAt: `2026-04-24T1${9 - index}:00:00.000Z`,
      }),
    );

    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics,
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', { sessions });

    const { wrapper } = makeWrapper();
    const { getByTestId, queryByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    // No overflow control — all started rows visible immediately
    expect(queryByTestId('started-show-more')).toBeNull();
    // All 6 started topics are rendered inline (topic-6 visible without any expand)
    getByTestId('started-row-topic-6');
  });

  it('renders the hero up-next state on a fresh book and starts a session', async () => {
    const { wrapper } = makeWrapper();
    const { getByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    getByTestId('up-next-row-topic-1');
    getByText('▶ Start: Linear Equations');

    fireEvent.press(getByTestId('book-start-learning'));
    expect(mockRouterFns.push).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'Linear Equations',
      },
    });
  });

  it('does not render empty topic slots when generated data has blank titles', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics: [
        makeTopic({ id: 'topic-1', title: 'Linear Equations', sortOrder: 1, chapter: 'Foundations' }),
        makeTopic({ id: 'topic-blank', title: '   ', sortOrder: 2, chapter: 'Generated blanks' }),
        makeTopic({ id: 'topic-3', title: 'Quadratic Equations', sortOrder: 3, chapter: 'Foundations' }),
      ],
      completedTopicCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { getByTestId, queryByTestId, queryByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    getByTestId('up-next-row-topic-1');
    getByTestId('later-row-topic-3');
    expect(queryByTestId('later-row-topic-blank')).toBeNull();
    expect(queryByText('Generated blanks')).toBeNull();
  });

  it('starts from the shared resume target when available', async () => {
    mockFetch.setRoute('progress/resume-target', {
      target: {
        subjectId: 'sub-1',
        subjectName: 'Mathematics',
        topicId: 'topic-2',
        topicTitle: 'Quadratic Equations',
        sessionId: null,
        resumeFromSessionId: 'sess-previous',
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-04-24T12:00:00.000Z',
        reason: 'Continue Quadratic Equations',
      },
    });

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    fireEvent.press(getByTestId('book-start-learning'));
    expect(mockRouterFns.push).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'sub-1',
        subjectName: 'Mathematics',
        topicId: 'topic-2',
        topicName: 'Quadratic Equations',
        resumeFromSessionId: 'sess-previous',
      },
    });
  });

  it('shows the sessions error banner and retries while still rendering retention-driven sections', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions',
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    );
    mockFetch.setRoute('subjects/sub-1/retention', {
      topics: [makeRetentionTopic({ topicId: 'topic-1' })],
      reviewDueCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('sessions-error-banner'));
    getByTestId('done-row-topic-1');
    getByTestId('up-next-row-topic-2');

    // Retry re-fires the fetch — just verify pressing the button fires another request
    mockFetch.mockClear();
    fireEvent.press(getByTestId('sessions-error-retry'));
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('shows the retention error banner and retries while keeping session-driven sections visible', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
      sessions: [makeSession({ topicId: 'topic-1', topicTitle: 'Linear Equations' })],
    });
    mockFetch.setRoute('subjects/sub-1/retention',
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    );

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('retention-error-banner'));
    // [BUG-895] continue-now-row removed; the sticky CTA still surfaces a
    // way to resume the topic, so the page stays actionable on retention error.
    getByTestId('book-start-learning');

    mockFetch.mockClear();
    fireEvent.press(getByTestId('retention-error-retry'));
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('renders the empty topics state with a setup CTA', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics: [],
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/sessions/first-curriculum', {
      session: { id: 'session-1', topicId: 'topic-1' },
    });

    const { wrapper } = makeWrapper();
    const { getByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('topics-empty-state'));
    getByText('This book is not ready yet');
    getByText('Set up this book');

    fireEvent.press(getByTestId('topics-empty-build'));
    await waitFor(() => {
      expect(mockRouterFns.push).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/session',
          params: expect.objectContaining({
            mode: 'learning',
            subjectId: 'sub-1',
            bookId: 'book-1',
            sessionId: 'session-1',
            topicId: 'topic-1',
            subjectName: 'Algebra',
          }),
        }),
      );
    });
  });

  it('renders the all-sections fallback when every topic is skipped', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics: [
        makeTopic({ id: 'topic-1', skipped: true }),
        makeTopic({ id: 'topic-2', skipped: true, sortOrder: 2 }),
      ],
      completedTopicCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('all-sections-fallback'));
    getByTestId('fallback-start');
  });

  it('renders past conversations and opens session summaries', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
      sessions: [
        makeSession({ id: 'sess-1', createdAt: '2026-04-24T09:00:00.000Z' }),
        makeSession({ id: 'sess-2', topicId: 'topic-2', topicTitle: 'Quadratic Equations', createdAt: '2026-04-24T08:00:00.000Z' }),
      ],
    });

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    // Past conversations section is collapsed by default — expand it first.
    // The toggle label includes the session count, so we match via testID.
    fireEvent.press(getByTestId('book-sessions-toggle'));

    fireEvent.press(getByTestId('session-sess-1'));
    expect(mockRouterFns.push).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: 'sess-1',
        subjectId: 'sub-1',
        topicId: 'topic-1',
      },
    });
  });

  it('shows chapter dividers when there are 4 or more sessions across chapters', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
      sessions: [
        makeSession({ id: 'sess-1', chapter: 'Chapter A' }),
        makeSession({ id: 'sess-2', topicId: 'topic-2', topicTitle: 'Quadratic Equations', chapter: 'Chapter A' }),
        makeSession({ id: 'sess-3', topicId: 'topic-3', topicTitle: 'Functions', chapter: 'Chapter B' }),
        makeSession({ id: 'sess-4', topicId: 'topic-4', topicTitle: 'Inequalities', chapter: 'Chapter B' }),
      ],
    });

    const { wrapper } = makeWrapper();
    const { getByText, getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    // Past conversations section is collapsed by default — expand it to see chapter dividers
    fireEvent.press(getByTestId('book-sessions-toggle'));

    getByText('Chapter A');
    getByText('Chapter B');
  });

  it('shows the book complete card and routes review to the relearn flow', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true, description: 'Basic algebra' },
      topics: [
        makeTopic({ id: 'topic-1', title: 'Linear Equations', sortOrder: 1 }),
        makeTopic({ id: 'topic-2', title: 'Quadratics', sortOrder: 2 }),
      ],
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/retention', {
      topics: [
        makeRetentionTopic({ topicId: 'topic-1', nextReviewAt: '2026-04-26T00:00:00.000Z' }),
        makeRetentionTopic({ topicId: 'topic-2', nextReviewAt: '2026-04-25T00:00:00.000Z' }),
      ],
      reviewDueCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { getByTestId, queryByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-complete-card'));
    expect(queryByTestId('book-start-learning')).toBeNull();

    fireEvent.press(getByTestId('book-complete-review'));
    expect(mockRouterFns.push).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId: 'topic-2',
        subjectId: 'sub-1',
        topicName: 'Quadratics',
      },
    });

    fireEvent.press(getByTestId('book-complete-next'));
    expect(mockRouterFns.push).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('does not render the completion card when one topic is still unstarted', async () => {
    mockFetch.setRoute('subjects/sub-1/retention', {
      topics: [makeRetentionTopic({ topicId: 'topic-1' })],
      reviewDueCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { queryByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => {
      expect(queryByTestId('book-complete-card')).toBeNull();
    });
  });

  it('shows the continue-learning sticky CTA naming the topic when a continue topic exists [BUG-895]', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
      sessions: [makeSession({ topicId: 'topic-1', topicTitle: 'Linear Equations' })],
    });

    const { wrapper } = makeWrapper();
    const { getByText, queryByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByText('▶ Continue: Linear Equations'));
    // [BUG-895] Sticky CTA names the topic so the duplicated "Continue now"
    // section in-list could be removed without losing context.
    expect(queryByTestId('continue-now-row')).toBeNull();
  });

  it('truncates a long continue-topic title in the sticky CTA [BUG-895]', async () => {
    const longTitle = 'A very long continuing topic title that exceeds limits';
    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
      sessions: [makeSession({ topicId: 'topic-1', topicTitle: longTitle })],
    });
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
      topics: [makeTopic({ id: 'topic-1', title: longTitle, sortOrder: 1 })],
      completedTopicCount: 0,
    });

    const { wrapper } = makeWrapper();
    const { getByText } = render(<BookScreen />, { wrapper });

    const truncated = `▶ Continue: ${longTitle.slice(0, 24)}...`;
    await waitFor(() => getByText(truncated));
  });

  it('shows and wires the build-learning-path link when no curriculum exists', async () => {
    mockFetch.setRoute('subjects/sub-1/sessions/first-curriculum', {
      session: { id: 'session-1', topicId: 'topic-1' },
    });

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-build-path-link'));
    fireEvent.press(getByTestId('book-build-path-link'));
    await waitFor(() => {
      expect(mockRouterFns.push).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/session',
          params: expect.objectContaining({
            mode: 'learning',
            subjectId: 'sub-1',
            bookId: 'book-1',
            sessionId: 'session-1',
            topicId: 'topic-1',
            subjectName: 'Algebra',
          }),
        }),
      );
    });
  });

  it('hides the build-learning-path link when curriculum already exists', async () => {
    mockFetch.setRoute('subjects/sub-1/curriculum', {
      curriculum: { topics: [{ id: 'ctopic-1' }] },
    });

    const { wrapper } = makeWrapper();
    const { queryByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => {
      expect(queryByTestId('book-build-path-link')).toBeNull();
    });
  });

  it('hides the sticky CTA in read-only mode', async () => {
    mockCurrentParams = { subjectId: 'sub-1', bookId: 'book-1', readOnly: 'true' };

    const { wrapper } = makeWrapper();
    const { queryByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => {
      expect(queryByTestId('book-start-learning')).toBeNull();
    });
  });

  it('auto-starts the up-next topic when autoStart is true', async () => {
    mockCurrentParams = { subjectId: 'sub-1', bookId: 'book-1', autoStart: 'true' };

    const { wrapper } = makeWrapper();
    render(<BookScreen />, { wrapper });

    await waitFor(() => {
      expect(mockRouterFns.push).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: 'sub-1',
          topicId: 'topic-1',
          topicName: 'Linear Equations',
        },
      });
    });
  });

  it('shows the generating state while topics are being created', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: false, description: 'Basic algebra' },
      topics: [],
      completedTopicCount: 0,
    });
    // generate-topics never resolves (simulates in-flight generation)
    mockFetch.setRoute('subjects/sub-1/books/book-1/generate-topics', () => new Promise(() => { /* never resolves */ }));

    const { wrapper } = makeWrapper();
    const { getByTestId, getByText } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-generating'));
    getByText('Algebra');
  });

  it('shows an alert when the initial generation request fails', async () => {
    const { platformAlert } = require('../../../../../lib/platform-alert') as { platformAlert: jest.Mock };

    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: false, description: null },
      topics: [],
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/books/book-1/generate-topics',
      new Response(JSON.stringify({ error: 'LLM service unavailable' }), { status: 500 }),
    );

    const { wrapper } = makeWrapper();
    render(<BookScreen />, { wrapper });

    await waitFor(() => {
      expect(platformAlert).toHaveBeenCalledWith(
        "Couldn't build this book",
        expect.any(String),
        expect.any(Array),
      );
    });
  });

  it('fires retry generation only once after the timed-out state', async () => {
    mockFetch.setRoute('subjects/sub-1/books/book-1', {
      book: { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: false, description: 'Basic algebra' },
      topics: [],
      completedTopicCount: 0,
    });
    mockFetch.setRoute('subjects/sub-1/books/book-1/generate-topics',
      new Response(JSON.stringify({ error: 'initial failure' }), { status: 500 }),
    );

    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-gen-retry'));

    // Now set up success for retry
    let retryCallCount = 0;
    mockFetch.setRoute('subjects/sub-1/books/book-1/generate-topics', () => {
      retryCallCount += 1;
      return new Response(JSON.stringify({ book: {}, topics: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    fireEvent.press(getByTestId('book-gen-retry'));
    expect(retryCallCount).toBe(1);
  });

  // Back button explicitly replaces with the shelf grid (one screen up).
  // router.back() falls through to the Tabs navigator's `firstRoute` (Home)
  // when the inner stack lacks a sibling `index` — common after cross-tab
  // direct pushes to this leaf route.
  it('replaces with the shelf grid on back press', async () => {
    const { wrapper } = makeWrapper();
    const { getByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    fireEvent.press(getByTestId('book-back'));
    expect(mockRouterFns.replace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
    expect(mockRouterFns.back).not.toHaveBeenCalled();
  });

  it('logs a breadcrumb and falls back to up next when the latest session topic no longer exists', async () => {
    (Sentry.addBreadcrumb as jest.Mock).mockClear();

    mockFetch.setRoute('subjects/sub-1/books/book-1/sessions', {
      sessions: [
        makeSession({
          id: 'sess-1',
          topicId: 'missing-topic',
          topicTitle: 'Deleted Topic',
          chapter: null,
          createdAt: '2026-04-24T12:00:00.000Z',
        }),
      ],
    });

    const { wrapper } = makeWrapper();
    const { getByTestId, queryByTestId } = render(<BookScreen />, { wrapper });

    await waitFor(() => getByTestId('book-screen'));

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'continueNowTopicId references missing topic',
      }),
    );
    expect(queryByTestId('continue-now-row')).toBeNull();
    getByTestId('up-next-row-topic-1');
  });
});
