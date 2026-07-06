import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../../test-utils/mock-api-routes';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../../../lib/profile';
import { createTestProfile } from '../../../test-utils/app-hook-test-utils';

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch assigned inside factory to bypass hoisting
// ---------------------------------------------------------------------------

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../lib/api-client', // gc1-allow: fetch-boundary — mockApiClientFactory installs hc() with a controlled mock fetch so real hooks exercise real request logic
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

// lib/profile removed — replaced with inline ProfileContext.Provider in wrapper below

// ---------------------------------------------------------------------------
// External / rendering mocks (kept — not API hooks)
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockPushLearningResumeTarget = jest.fn();
type TopicRouteParams = {
  subjectId: string;
  topicId: string;
  bookId?: string;
  chapter?: string;
};
const mockUseLocalSearchParams = jest.fn(
  (): TopicRouteParams => ({
    subjectId: 's1',
    topicId: 't1',
  }),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      primary: '#00b4d8',
      accent: '#00b4d8',
      muted: '#888888',
      background: '#ffffff',
      border: '#e8e0d4',
      surface: '#f5f5f5',
      surfaceElevated: '#eeeeee',
      textPrimary: '#1a1a1a',
      textSecondary: '#666666',
      retentionWeak: '#ff0000',
      retentionFading: '#ffaa00',
      retentionStrong: '#00ff00',
      success: '#00c851',
      warning: '#ffbb33',
      danger: '#ff4444',
    }),
  }),
);

jest.mock(
  '../../../lib/navigation' /* gc1-allow: goBackOrReplace calls router.back which requires native navigation context */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
    pushLearningResumeTarget: (...args: unknown[]) =>
      mockPushLearningResumeTarget(...args),
  }),
);

// ---------------------------------------------------------------------------
// Default API data
// ---------------------------------------------------------------------------

const DEFAULT_TOPIC_PROGRESS = {
  topicId: 't1',
  title: 'Algebra',
  description: '',
  completionStatus: 'not_started',
  struggleStatus: 'normal',
  masteryScore: null,
  summaryExcerpt: null,
  xpStatus: null,
  retentionStatus: null,
  masteredAt: null,
  strongReviews: 0,
  strongReviewsTarget: 5,
};

const DEFAULT_RETENTION_CARD = {
  topicId: 't1',
  failureCount: 0,
  repetitions: 0,
  easeFactor: 2.5,
  nextReviewAt: null,
  lastReviewedAt: null,
  masteredAt: null,
  intervalDays: 1,
  xpStatus: 'pending',
};

// ---------------------------------------------------------------------------
// Route configuration helpers
// ---------------------------------------------------------------------------

interface SetupOptions {
  completionStatus?: string;
  failureCount?: number;
  struggleStatus?: string;
  repetitions?: number;
  easeFactor?: number;
  nextReviewAt?: string | null;
  lastReviewedAt?: string | null;
  activeSessionId?: string | null;
  progressOverride?: object | null;
  retentionOverride?: object | null;
  resumeTarget?: object | null;
  resolveResult?: object | null | false;
  notes?: object[];
  sessions?: object[];
  bookmarks?: object[];
}

function setupRoutes(opts: SetupOptions = {}) {
  const {
    completionStatus = 'not_started',
    failureCount = 0,
    repetitions = 0,
    easeFactor = 2.5,
    nextReviewAt = null,
    lastReviewedAt = null,
    activeSessionId = null,
    progressOverride,
    retentionOverride,
    resumeTarget = null,
    resolveResult = false,
    notes = [],
    sessions = [],
    bookmarks = [],
  } = opts;

  // GET /topics/t1/progress → { topic }
  mockFetch.setRoute('/topics/t1/progress', {
    topic:
      progressOverride !== undefined
        ? progressOverride
        : { ...DEFAULT_TOPIC_PROGRESS, completionStatus },
  });

  // GET /topics/t1/retention → { card }
  mockFetch.setRoute('/topics/t1/retention', {
    card:
      retentionOverride !== undefined
        ? retentionOverride
        : {
            ...DEFAULT_RETENTION_CARD,
            failureCount,
            repetitions,
            easeFactor,
            nextReviewAt,
            lastReviewedAt,
          },
  });

  // GET /progress/topic/t1/active-session → { sessionId } | null
  mockFetch.setRoute(
    '/active-session',
    activeSessionId ? { sessionId: activeSessionId } : null,
  );

  // GET /progress/resume-target → { target }
  mockFetch.setRoute('/resume-target', { target: resumeTarget });

  // GET /topics/t1/resolve → resolve result (false means don't set)
  if (resolveResult !== false) {
    mockFetch.setRoute('/resolve', resolveResult);
  }

  // GET /subjects/s1/topics/t1/notes → { notes }
  mockFetch.setRoute('/topics/t1/notes', { notes });

  // GET /subjects/s1/topics/t1/sessions → { sessions }
  mockFetch.setRoute('/topics/t1/sessions', { sessions });

  // GET /bookmarks?topicId=t1 → { bookmarks, nextCursor: null }
  mockFetch.setRoute('/bookmarks', { bookmarks, nextCursor: null });

  // GET /subjects/s1/books/:bookId → BookWithTopics (empty connections — used
  // by relatedTopics rail). Registered unconditionally so any test that passes
  // bookId in search params receives a settled query rather than a pending
  // request that completes after unmount and triggers an act() warning.
  mockFetch.setRoute('/books/book-1', {
    book: {
      id: 'book-1',
      subjectId: 's1',
      title: 'Test Book',
      description: null,
      emoji: null,
      sortOrder: 0,
      topicsGenerated: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    topics: [],
    connections: [],
    status: 'NOT_STARTED',
  });
}

// ---------------------------------------------------------------------------
// QueryClient + ProfileContext wrapper
// ---------------------------------------------------------------------------

const testProfile: Profile = createTestProfile({
  id: 'test-profile-id',
  accountId: 'test-account-id',
  displayName: 'Test Learner',
  isOwner: true,
  birthYear: 1990,
});

const profileContextValue: ProfileContextValue = {
  profiles: [testProfile],
  activeProfile: testProfile,
  isExplicitProxyMode: false,
  switchProfile: async () => ({ success: true }),
  isLoading: false,
  profileLoadError: null,
  profileWasRemoved: false,
  acknowledgeProfileRemoval: () => undefined,
};

function createWrapper(profileContext?: Partial<ProfileContextValue>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const value: ProfileContextValue = {
    ...profileContextValue,
    ...profileContext,
  };
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={value}>
          {children}
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

const TopicDetailScreen = require('./[topicId]').default;

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('TopicDetailScreen action buttons', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      topicId: 't1',
    });
    setupRoutes();
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  it('shows loading state while the topic is loading', async () => {
    let resolveProgress!: (r: Response) => void;
    const progressPromise = new Promise<Response>((resolve) => {
      resolveProgress = resolve;
    });
    mockFetch.setRoute('/topics/t1/progress', () => progressPromise);

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    screen.getByTestId('topic-detail-loading');

    resolveProgress(
      new Response(JSON.stringify({ topic: { ...DEFAULT_TOPIC_PROGRESS } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('shows "Start studying" as the CTA for not_started topics', async () => {
    setupRoutes({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('study-cta');
    });
    screen.getByText('Start studying');
  });

  it('navigates into a new learning session from the study CTA', async () => {
    setupRoutes({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('study-cta');
    });
    fireEvent.press(screen.getByTestId('study-cta'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 's1',
        topicId: 't1',
        topicName: 'Algebra',
      },
    });
  });

  it('shows "Review this topic" as CTA for in_progress topics', async () => {
    setupRoutes({
      completionStatus: 'in_progress',
      activeSessionId: 'session-123',
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Review this topic');
    });
  });

  it('uses the shared topic resume target for in-progress topics', async () => {
    const target = {
      subjectId: 's1',
      subjectName: 'Math',
      topicId: 't1',
      topicTitle: 'Algebra',
      sessionId: null,
      resumeFromSessionId: 'old-session',
      resumeKind: 'recent_topic',
      lastActivityAt: '2026-02-15T09:00:00.000Z',
      reason: 'Continue Algebra',
    };
    setupRoutes({
      completionStatus: 'in_progress',
      activeSessionId: 'session-123',
      resumeTarget: target,
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('study-cta');
    });
    fireEvent.press(screen.getByTestId('study-cta'));
    expect(mockPushLearningResumeTarget).toHaveBeenCalledWith(
      expect.anything(),
      target,
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows "Review this topic" when the learner has high failure count', async () => {
    setupRoutes({
      completionStatus: 'completed',
      failureCount: 3,
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Review this topic');
    });
  });

  it('shows "Review this topic" when a completed topic is overdue', async () => {
    setupRoutes({
      completionStatus: 'completed',
      nextReviewAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Review this topic');
    });
  });

  it('shows "Practice again" for strong-retention completed topics', async () => {
    setupRoutes({
      completionStatus: 'completed',
      repetitions: 3,
      nextReviewAt: new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Practice again');
    });
  });
});

// ---------------------------------------------------------------------------
// UX resilience: error, empty, missing-params states
// ---------------------------------------------------------------------------

describe('TopicDetailScreen error / empty / missing-params states', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      topicId: 't1',
    });
    setupRoutes();
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  it('shows missing-params state when route params are absent', async () => {
    mockUseLocalSearchParams.mockReturnValue(
      {} as { subjectId: string; topicId: string },
    );

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    // Missing params renders immediately without data fetch
    screen.getByTestId('topic-detail-missing-params-back');
    screen.getByText('Topic not found');

    fireEvent.press(screen.getByTestId('topic-detail-missing-params-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('shows empty state when topic data is null after loading', async () => {
    mockFetch.setRoute('/topics/t1/progress', { topic: null });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-empty');
    });
    screen.getByText('Topic not found');
    screen.getByTestId('topic-detail-empty-back');
  });

  it('shows retry, go-back, and go-home when queries error [3B.6]', async () => {
    mockFetch.setRoute('/topics/t1/progress', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: "We couldn't load this topic" }),
          { status: 500 },
        ),
      ),
    );
    mockFetch.setRoute('/topics/t1/retention', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Retention error' }), {
          status: 500,
        }),
      ),
    );

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-retry');
    });
    screen.getByTestId('topic-detail-go-back');
    screen.getByTestId('topic-detail-go-home');
    screen.getByText("We couldn't load this topic");

    fireEvent.press(screen.getByTestId('topic-detail-go-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('topic-detail-go-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('[F-009] shows loading spinner while resolving subjectId from a deep-link (no subjectId param)', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 't1',
    } as { subjectId: string; topicId: string });

    let resolveResponse!: (r: Response) => void;
    const resolvePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    mockFetch.setRoute('/resolve', () => resolvePromise);

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    expect(screen.queryByText('Topic not found')).toBeNull();

    resolveResponse(
      new Response(
        JSON.stringify({
          subjectId: 's1',
          subjectName: 'Mathematics',
          topicTitle: 'Algebra',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  it('[F-009] renders topic content after resolving subjectId from deep-link', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 't1',
    } as { subjectId: string; topicId: string });

    mockFetch.setRoute('/resolve', {
      subjectId: 's1',
      subjectName: 'Mathematics',
      topicTitle: 'Algebra',
    });

    setupRoutes({ completionStatus: 'in_progress' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('study-cta');
    });
    screen.getByText('Review this topic');
  });
});

// ---------------------------------------------------------------------------
// Rendering: topic header, last studied, notes, sessions
// ---------------------------------------------------------------------------

describe('TopicDetailScreen rendering details', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      topicId: 't1',
    });
    setupRoutes();
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  it('renders topic title from progress data', async () => {
    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Algebra');
    });
  });

  it('renders the topic coverage description from progress data', async () => {
    setupRoutes({
      progressOverride: {
        ...DEFAULT_TOPIC_PROGRESS,
        description:
          'This topic covers planning, organizing, leading, and controlling.',
      },
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('This topic covers');
    });
    screen.getByText(
      'This topic covers planning, organizing, leading, and controlling.',
    );
  });

  it('shows "Never studied" italic when topic has never been reviewed', async () => {
    setupRoutes({ lastReviewedAt: null });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Never studied');
    });
  });

  it('uses the latest topic session date when retention has no review date', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    setupRoutes({
      lastReviewedAt: null,
      sessions: [
        {
          id: 'session-1',
          sessionType: 'learning',
          durationSeconds: 120,
          createdAt: yesterday,
        },
      ],
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Last studied Yesterday');
    });
    expect(screen.queryByText('Never studied')).toBeNull();
  });

  it('shows last studied date when topic has been reviewed', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    setupRoutes({ lastReviewedAt: yesterday });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Last studied Yesterday');
    });
  });

  it('replaces to the library fallback on back when no parent book is present', async () => {
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    fireEvent.press(screen.getByTestId('topic-detail-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('replaces to the parent book when opened from a book route', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      bookId: 'book-1',
      topicId: 't1',
    });
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    fireEvent.press(screen.getByTestId('topic-detail-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId: 's1', bookId: 'book-1' },
    });
    expect(mockGoBackOrReplace).not.toHaveBeenCalled();
  });

  it('shows "No sessions yet. Start one below!" when sessions are empty', async () => {
    setupRoutes({ completionStatus: 'not_started', sessions: [] });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('No sessions yet');
    });
    fireEvent.press(screen.getByTestId('topic-sessions-strip'));
    screen.getByTestId('topic-sessions-empty');
    screen.getByText('No sessions yet. Start one below!');
  });

  it('shows session count and total time when sessions exist', async () => {
    setupRoutes({
      sessions: [
        {
          id: 'session-1',
          sessionType: 'learning',
          durationSeconds: 120,
          createdAt: '2026-04-30T12:00:00.000Z',
        },
        {
          id: 'session-2',
          sessionType: 'learning',
          durationSeconds: 45,
          createdAt: '2026-04-29T12:00:00.000Z',
        },
      ],
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('2 sessions · 2 min total');
    });
    fireEvent.press(screen.getByTestId('topic-sessions-strip'));
    screen.getByTestId('topic-sessions-list');
  });

  it('keeps note actions inside the notes strip when no notes exist', async () => {
    setupRoutes({ notes: [] });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Add your first note for this topic');
    });
    expect(screen.queryByTestId('add-note-button')).toBeNull();
    fireEvent.press(screen.getByTestId('topic-notes-strip'));
    screen.getByText('+ Add your first note for this topic');
  });

  it('reveals existing topic notes when the notes strip is opened', async () => {
    setupRoutes({
      notes: [
        {
          id: 'note-1',
          topicId: 't1',
          content: 'My first note',
          sessionId: null,
          createdAt: '2026-01-01T10:00:00.000Z',
          updatedAt: '2026-01-01T10:00:00.000Z',
        },
      ],
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('1 note saved for this topic');
    });
    fireEvent.press(screen.getByTestId('topic-notes-strip'));
    screen.getByText('My first note');
    screen.getByText('+ Add a note');
  });

  it('hides topic note write and delete affordances in parent-proxy view', async () => {
    const proxyChildProfile = createTestProfile({
      id: 'proxy-child-profile',
      accountId: 'test-account-id',
      displayName: 'Proxy Child',
      isOwner: false,
      birthYear: 2014,
    });
    setupRoutes({
      notes: [
        {
          id: 'note-1',
          topicId: 't1',
          content: 'My first note',
          sessionId: null,
          createdAt: '2026-01-01T10:00:00.000Z',
          updatedAt: '2026-01-01T10:00:00.000Z',
        },
      ],
    });
    const { Wrapper } = createWrapper({
      profiles: [testProfile, proxyChildProfile],
      activeProfile: proxyChildProfile,
      isExplicitProxyMode: true,
    });

    render(<TopicDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('1 note saved for this topic');
    });
    fireEvent.press(screen.getByTestId('topic-notes-strip'));

    screen.getByText('My first note');
    expect(screen.queryByTestId('note-card-note-1-menu')).toBeNull();
    expect(screen.queryByTestId('add-note-button')).toBeNull();
    expect(screen.queryByText('+ Add a note')).toBeNull();
  });

  it('reveals saved chat bookmarks for this topic when the strip is opened', async () => {
    setupRoutes({
      bookmarks: [
        {
          id: 'bookmark-1',
          eventId: 'event-1',
          sessionId: 'session-1',
          subjectId: 's1',
          topicId: 't1',
          subjectName: 'Math',
          topicTitle: 'Algebra',
          content: 'This is a saved explanation from chat.',
          createdAt: '2026-05-13T10:00:00.000Z',
        },
      ],
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Saved from chat');
    });
    fireEvent.press(screen.getByTestId('topic-bookmarks-strip'));
    screen.getByTestId('bookmark-card-bookmark-1');
  });

  it('shows an empty bookmarks message inside the strip when no bookmarks exist', async () => {
    setupRoutes({ bookmarks: [] });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('No saved chat for this topic yet');
    });
    fireEvent.press(screen.getByTestId('topic-bookmarks-strip'));
    screen.getByTestId('topic-bookmarks-empty');
  });

  it('opens source session when a topic bookmark is pressed', async () => {
    setupRoutes({
      bookmarks: [
        {
          id: 'bookmark-1',
          eventId: 'event-1',
          sessionId: 'session-1',
          subjectId: 's1',
          topicId: 't1',
          subjectName: 'Math',
          topicTitle: 'Algebra',
          content: 'Saved chat item.',
          createdAt: '2026-05-13T10:00:00.000Z',
        },
      ],
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Saved chat item.');
    });
    fireEvent.press(screen.getByTestId('topic-bookmarks-strip'));
    screen.getByTestId('bookmark-card-bookmark-1');
    fireEvent.press(screen.getByTestId('bookmark-card-bookmark-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: 'session-1',
        subjectId: 's1',
        topicId: 't1',
      },
    });
  });

  it('shows "Loading..." disabled CTA while critical data is loading', async () => {
    let resolveProgress!: (r: Response) => void;
    const progressPromise = new Promise<Response>((resolve) => {
      resolveProgress = resolve;
    });
    mockFetch.setRoute('/topics/t1/progress', () => progressPromise);

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    screen.getByText('Loading...');

    resolveProgress(
      new Response(JSON.stringify({ topic: { ...DEFAULT_TOPIC_PROGRESS } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

describe('TopicDetailScreen — Saved from chat (bookmarks)', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: 's1',
      topicId: 't1',
    });
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  it('sends topicId on the bookmarks request (server-side filter, not client)', async () => {
    setupRoutes({ bookmarks: [] });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      const bookmarkCall = mockFetch.mock.calls.find(
        ([url]: [unknown, ...unknown[]]) => String(url).includes('/bookmarks'),
      );
      expect(bookmarkCall).toBeTruthy();
      expect(String(bookmarkCall![0])).toContain('topicId=t1');
    });
  });
});

// ---------------------------------------------------------------------------
// [H9] Deep-link resolve timeout — Retry is a real escape (regression)
// ---------------------------------------------------------------------------

describe('TopicDetailScreen — deep-link resolve timeout Retry', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Deep-link: topicId only, no subjectId → triggers resolve
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 't1',
    } as { subjectId: string; topicId: string });
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('[H9] Retry re-invokes the resolve fetch AND restarting the timeout window', async () => {
    // Route /resolve to a never-settling promise so resolveLoading stays true.
    // Capture the resolver so the promise never settles (never call it).
    let _capturedResolveResolver!: (r: Response) => void;
    const neverSettlingResolve = new Promise<Response>((resolve) => {
      _capturedResolveResolver = resolve;
    });
    mockFetch.setRoute('/resolve', () => neverSettlingResolve);

    // Also set up other routes so secondary queries don't emit noise
    mockFetch.setRoute('/topics/t1/progress', { topic: null });
    mockFetch.setRoute('/topics/t1/retention', { card: null });
    mockFetch.setRoute('/active-session', null);
    mockFetch.setRoute('/resume-target', { target: null });
    mockFetch.setRoute('/topics/t1/notes', { notes: [] });
    mockFetch.setRoute('/topics/t1/sessions', { sessions: [] });
    mockFetch.setRoute('/bookmarks', { bookmarks: [], nextCursor: null });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    // Advance 15 s → first timeout fires → error screen appears
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    await Promise.resolve();
    screen.getByTestId('topic-resolve-timeout');

    const resolveCallsBefore = fetchCallsMatching(mockFetch, '/resolve').length;

    // Tap Retry
    await act(async () => {
      fireEvent.press(screen.getByTestId('topic-resolve-timeout-retry'));
    });
    await Promise.resolve();

    // Verify the resolve endpoint was called again (new query key forces a new network request).
    // Pre-fix: refetch() on an in-flight query returns the existing promise (TanStack dedup);
    //   call count is unchanged.
    // Post-fix: resolveAttempt increments → new key → new query → new fetch.
    expect(fetchCallsMatching(mockFetch, '/resolve').length).toBeGreaterThan(
      resolveCallsBefore,
    );

    // After Retry the timeout window must restart: advance another 15 s → error screen reappears.
    // Pre-fix: the effect never re-runs (isResolveSpinning didn't change), so the user stays stuck
    // on the spinner → topic-resolve-timeout testID is NOT present → this assertion would fail.
    // Post-fix: resolveAttempt increments, re-running the effect → timeout fires → testID appears.
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    await Promise.resolve();
    screen.getByTestId('topic-resolve-timeout');

    // Reference the captured resolver to satisfy TypeScript (it is never called intentionally)
    void _capturedResolveResolver;
  });
});
