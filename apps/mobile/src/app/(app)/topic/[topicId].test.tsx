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
import { queryKeys } from '../../../lib/query-keys';
import { createTestProfile } from '../../../test-utils/app-hook-test-utils';

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch assigned inside factory to bypass hoisting
// ---------------------------------------------------------------------------

let mockFetch: RoutedMockFetch;

const PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '10000000-0000-4000-8000-0000000000a1';
const SUBJECT_ID = '11111111-1111-7111-8111-111111111111';
const TOPIC_ID = '22222222-2222-7222-8222-222222222222';
const BOOK_ID = '33333333-3333-7333-8333-333333333333';
const SESSION_ID = '44444444-4444-7444-8444-444444444444';
const NOTE_ID = '66666666-6666-7666-8666-666666666666';
const BOOKMARK_ID = '77777777-7777-7777-8777-777777777777';
const BOOKMARK_EVENT_ID = '99999999-9999-7999-8999-999999999999';
const ISO_NOW = '2026-02-15T09:00:00.000Z';

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
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockPushLearningResumeTarget = jest.fn();
const mockConsumeHubToTopicTransition = jest.fn(
  (_subjectId: string, _topicId: string) => false,
);
type TopicRouteParams = {
  subjectId: string;
  topicId: string;
  bookId?: string;
  chapter?: string;
  mode?: string;
  returnTo?: string;
  hubReturnTo?: string;
};
const mockUseLocalSearchParams = jest.fn(
  (): TopicRouteParams => ({
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
  }),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock(
  '../../../lib/navigation-transition-provenance',
  () => ({
    ...jest.requireActual('../../../lib/navigation-transition-provenance'),
    consumeHubToTopicTransition: (subjectId: string, topicId: string) =>
      mockConsumeHubToTopicTransition(subjectId, topicId),
  }),
  { virtual: true },
);

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
    ...jest.requireActual('../../../lib/navigation'),
    pushLearningResumeTarget: (...args: unknown[]) =>
      mockPushLearningResumeTarget(...args),
  }),
);

// ---------------------------------------------------------------------------
// Default API data
// ---------------------------------------------------------------------------

const DEFAULT_TOPIC_PROGRESS = {
  topicId: TOPIC_ID,
  title: 'Algebra',
  description: '',
  completionStatus: 'not_started',
  daysSinceLastReview: null,
  struggleStatus: 'normal',
  masteryScore: null,
  summaryExcerpt: null,
  xpStatus: null,
  retentionStatus: null,
  masteredAt: null,
  strongReviews: 0,
  strongReviewsTarget: 5,
  totalSessions: 0,
};

const DEFAULT_RETENTION_CARD = {
  topicId: TOPIC_ID,
  failureCount: 0,
  repetitions: 0,
  easeFactor: 2.5,
  nextReviewAt: null,
  lastReviewedAt: null,
  daysSinceLastReview: null,
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

  // GET /topics/:topicId/progress → { topic }
  mockFetch.setRoute(`/topics/${TOPIC_ID}/progress`, {
    topic:
      progressOverride !== undefined
        ? progressOverride
        : { ...DEFAULT_TOPIC_PROGRESS, completionStatus },
  });

  // GET /topics/:topicId/retention → { card }
  mockFetch.setRoute(`/topics/${TOPIC_ID}/retention`, {
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

  // GET /progress/topic/:topicId/active-session → { sessionId } | null
  mockFetch.setRoute(
    '/active-session',
    activeSessionId ? { sessionId: activeSessionId } : null,
  );

  // GET /progress/resume-target → { target }
  mockFetch.setRoute('/resume-target', { target: resumeTarget });

  // GET /topics/:topicId/resolve → resolve result (false means don't set)
  if (resolveResult !== false) {
    mockFetch.setRoute('/resolve', resolveResult);
  }

  // GET /subjects/:subjectId/topics/:topicId/notes → { notes }
  mockFetch.setRoute(`/topics/${TOPIC_ID}/notes`, { notes });

  // GET /subjects/:subjectId/topics/:topicId/sessions → { sessions }
  mockFetch.setRoute(`/topics/${TOPIC_ID}/sessions`, { sessions });

  // GET /bookmarks?topicId=:topicId → { bookmarks, nextCursor: null }
  mockFetch.setRoute('/bookmarks', { bookmarks, nextCursor: null });

  // GET /subjects/:subjectId/books/:bookId → BookWithTopics (empty connections — used
  // by relatedTopics rail). Registered unconditionally so any test that passes
  // bookId in search params receives a settled query rather than a pending
  // request that completes after unmount and triggers an act() warning.
  mockFetch.setRoute(`/books/${BOOK_ID}`, {
    book: {
      id: BOOK_ID,
      subjectId: SUBJECT_ID,
      title: 'Test Book',
      description: null,
      emoji: null,
      sortOrder: 0,
      topicsGenerated: true,
      createdAt: ISO_NOW,
      updatedAt: ISO_NOW,
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
  id: PROFILE_ID,
  accountId: ACCOUNT_ID,
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
    mockConsumeHubToTopicTransition.mockReturnValue(false);
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
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
    mockFetch.setRoute(`/topics/${TOPIC_ID}/progress`, () => progressPromise);

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
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        topicName: 'Algebra',
      },
    });
  });

  // [WI-2112] challenge.start deep links (Now-feed cards, mentor-bar intents,
  // and direct topic ?mode=challenge links all resolve to this same
  // /(app)/topic/:topicId?mode=challenge route — see now-deep-link.ts and
  // bar-intent-match.ts, both already covered for the upstream URL
  // resolution) must enter the existing Challenge Round path (the
  // sessionType==='learning' session where useChallengeRound/
  // evaluateChallengeReadiness live), never the unrelated recall-test recall
  // quiz. Covered across a non-literature and a literature (Sylvia Plath)
  // subject per AC-7 — the dispatch is subject-agnostic, so only topicName
  // varies.
  it.each([
    ['non-literature subject', 'Algebra'],
    ['literature subject — Sylvia Plath', 'Sylvia Plath'],
  ])(
    'routes a challenge.start deep link into the Challenge Round session path, not recall-test (%s)',
    async (_label, topicTitle) => {
      setupRoutes({
        progressOverride: {
          ...DEFAULT_TOPIC_PROGRESS,
          completionStatus: 'not_started',
          title: topicTitle,
        },
      });
      mockUseLocalSearchParams.mockReturnValue({
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        mode: 'challenge',
      });

      render(<TopicDetailScreen />, { wrapper: TestWrapper });

      await waitFor(() => {
        screen.getByTestId('study-cta');
      });
      fireEvent.press(screen.getByTestId('study-cta'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          topicName: topicTitle,
        },
      });
      // In-session negative case: the deep-link dispatch must never resolve
      // to the recall-test recall quiz.
      expect(mockPush).not.toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/topic/recall-test',
        }),
      );
    },
  );

  it('resumes an existing shared resume target from a challenge.start deep link, instead of starting a fresh session', async () => {
    // evaluateChallengeReadiness() gates on the CURRENT session's live
    // exchangeCount/streak (apps/api/src/services/challenge-round/trigger.ts).
    // Force-starting a new session would discard that state, so a
    // challenge.start deep link must resume an already-active session the
    // same way the default (non-deep-link) study CTA does (F-4), not bypass
    // it.
    const target = {
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: TOPIC_ID,
      topicTitle: 'Algebra',
      sessionId: null,
      resumeFromSessionId: SESSION_ID,
      resumeKind: 'recent_topic',
      lastActivityAt: '2026-02-15T09:00:00.000Z',
      reason: 'Continue Algebra',
    };
    setupRoutes({
      completionStatus: 'in_progress',
      activeSessionId: SESSION_ID,
      resumeTarget: target,
    });
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      mode: 'challenge',
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

  it('carries the active sessionId when a challenge.start deep link has an active session but no shared resume target', async () => {
    setupRoutes({
      completionStatus: 'in_progress',
      activeSessionId: SESSION_ID,
      resumeTarget: null,
    });
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      mode: 'challenge',
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('study-cta');
    });
    fireEvent.press(screen.getByTestId('study-cta'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        topicName: 'Algebra',
        sessionId: SESSION_ID,
      },
    });
  });

  it('shows "Review this topic" as CTA for in_progress topics', async () => {
    setupRoutes({
      completionStatus: 'in_progress',
      activeSessionId: SESSION_ID,
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Review this topic');
    });
  });

  it('uses the shared topic resume target for in-progress topics', async () => {
    const target = {
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: TOPIC_ID,
      topicTitle: 'Algebra',
      sessionId: null,
      resumeFromSessionId: SESSION_ID,
      resumeKind: 'recent_topic',
      lastActivityAt: '2026-02-15T09:00:00.000Z',
      reason: 'Continue Algebra',
    };
    setupRoutes({
      completionStatus: 'in_progress',
      activeSessionId: SESSION_ID,
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
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
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
  });

  it('shows load error when the topic payload is null after loading', async () => {
    mockFetch.setRoute(`/topics/${TOPIC_ID}/progress`, { topic: null });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-retry');
    });
    screen.getByText("We couldn't load this topic");
    screen.getByTestId('topic-detail-go-back');
  });

  it('shows retry, go-back, and go-home when queries error [3B.6]', async () => {
    mockFetch.setRoute(`/topics/${TOPIC_ID}/progress`, () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: "We couldn't load this topic" }),
          { status: 500 },
        ),
      ),
    );
    mockFetch.setRoute(`/topics/${TOPIC_ID}/retention`, () =>
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

    fireEvent.press(screen.getByTestId('topic-detail-go-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('[F-009] shows loading spinner while resolving subjectId from a deep-link (no subjectId param)', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: TOPIC_ID,
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
          subjectId: SUBJECT_ID,
          subjectName: 'Mathematics',
          topicTitle: 'Algebra',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  it('[F-009] renders topic content after resolving subjectId from deep-link', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: TOPIC_ID,
    } as { subjectId: string; topicId: string });

    mockFetch.setRoute('/resolve', {
      subjectId: SUBJECT_ID,
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
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
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
          id: SESSION_ID,
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
  });

  it('replaces to the parent book when opened from a book route', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
      topicId: TOPIC_ID,
    });
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    fireEvent.press(screen.getByTestId('topic-detail-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId: SUBJECT_ID, bookId: BOOK_ID },
    });
  });

  it('returns a due-review topic to the exact Subject Hub contract', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
      topicId: TOPIC_ID,
      returnTo: 'subject-hub',
    });
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    fireEvent.press(screen.getByTestId('topic-detail-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/subject-hub/[subjectId]',
      params: { subjectId: SUBJECT_ID },
    });
  });

  it('does not trust crafted Hub ancestry URL params when browser history exists', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
      topicId: TOPIC_ID,
      returnTo: 'subject-hub',
      hubReturnTo: 'subjects',
    });
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    fireEvent.press(screen.getByTestId('topic-detail-back'));

    expect(mockConsumeHubToTopicTransition).toHaveBeenCalledWith(
      SUBJECT_ID,
      TOPIC_ID,
    );
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/subject-hub/[subjectId]',
      params: { subjectId: SUBJECT_ID },
    });
  });

  it('pops to the Hub only after consuming the actual Hub-to-Topic transition', async () => {
    mockConsumeHubToTopicTransition.mockReturnValue(true);
    mockUseLocalSearchParams.mockReturnValue({
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
      topicId: TOPIC_ID,
      returnTo: 'subject-hub',
    });
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    fireEvent.press(screen.getByTestId('topic-detail-back'));

    expect(mockConsumeHubToTopicTransition).toHaveBeenCalledWith(
      SUBJECT_ID,
      TOPIC_ID,
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
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

  it('[WI-2184] converges stale history to one row across refetch and revisit', async () => {
    setupRoutes({ sessions: [] });
    const { queryClient, Wrapper } = createWrapper();
    const topicHistoryKey = queryKeys.topicSessions(
      SUBJECT_ID,
      TOPIC_ID,
      PROFILE_ID,
    );
    queryClient.setQueryDefaults(topicHistoryKey, { gcTime: Infinity });
    queryClient.setQueryData(topicHistoryKey, []);

    const firstVisit = render(<TopicDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByText('No sessions yet');
    });
    fireEvent.press(screen.getByTestId('topic-sessions-strip'));
    screen.getByTestId('topic-sessions-empty');

    const fetchesBeforeInvalidation = fetchCallsMatching(
      mockFetch,
      `/topics/${TOPIC_ID}/sessions`,
    ).length;
    setupRoutes({
      sessions: [
        {
          id: SESSION_ID,
          sessionType: 'learning',
          durationSeconds: 120,
          createdAt: '2026-04-30T12:00:00.000Z',
        },
      ],
    });
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: topicHistoryKey,
        exact: true,
      });
    });

    await waitFor(() => {
      screen.getByText('1 session · 2 min total');
    });
    expect(
      fetchCallsMatching(mockFetch, `/topics/${TOPIC_ID}/sessions`).length,
    ).toBeGreaterThan(fetchesBeforeInvalidation);
    screen.getByTestId('topic-sessions-list');
    expect(screen.getAllByTestId(`session-row-${SESSION_ID}`)).toHaveLength(1);
    expect(screen.queryByTestId('topic-sessions-empty')).toBeNull();

    await act(async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: topicHistoryKey,
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: topicHistoryKey,
          exact: true,
        }),
      ]);
    });
    expect(screen.getAllByTestId(`session-row-${SESSION_ID}`)).toHaveLength(1);

    firstVisit.unmount();
    render(<TopicDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => {
      screen.getByText('1 session · 2 min total');
    });
    fireEvent.press(screen.getByTestId('topic-sessions-strip'));
    expect(screen.getAllByTestId(`session-row-${SESSION_ID}`)).toHaveLength(1);
    expect(screen.queryByTestId('topic-sessions-empty')).toBeNull();

    fireEvent.press(screen.getByTestId(`session-row-${SESSION_ID}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: SESSION_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
      },
    });
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
          id: NOTE_ID,
          topicId: TOPIC_ID,
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
      id: '88888888-8888-7888-8888-888888888888',
      accountId: ACCOUNT_ID,
      displayName: 'Proxy Child',
      isOwner: false,
      birthYear: 2014,
    });
    setupRoutes({
      notes: [
        {
          id: NOTE_ID,
          topicId: TOPIC_ID,
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
    expect(screen.queryByTestId(`note-card-${NOTE_ID}-menu`)).toBeNull();
    expect(screen.queryByTestId('add-note-button')).toBeNull();
    expect(screen.queryByText('+ Add a note')).toBeNull();
  });

  it('reveals saved chat bookmarks for this topic when the strip is opened', async () => {
    setupRoutes({
      bookmarks: [
        {
          id: BOOKMARK_ID,
          eventId: BOOKMARK_EVENT_ID,
          sessionId: SESSION_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
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
    screen.getByTestId(`bookmark-card-${BOOKMARK_ID}`);
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
          id: BOOKMARK_ID,
          eventId: BOOKMARK_EVENT_ID,
          sessionId: SESSION_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
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
    screen.getByTestId(`bookmark-card-${BOOKMARK_ID}`);
    fireEvent.press(screen.getByTestId(`bookmark-card-${BOOKMARK_ID}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: SESSION_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
      },
    });
  });

  it('shows "Loading..." disabled CTA while critical data is loading', async () => {
    let resolveProgress!: (r: Response) => void;
    const progressPromise = new Promise<Response>((resolve) => {
      resolveProgress = resolve;
    });
    mockFetch.setRoute(`/topics/${TOPIC_ID}/progress`, () => progressPromise);

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
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
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
      expect(String(bookmarkCall![0])).toContain(`topicId=${TOPIC_ID}`);
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
      topicId: TOPIC_ID,
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
    mockFetch.setRoute(`/topics/${TOPIC_ID}/progress`, { topic: null });
    mockFetch.setRoute(`/topics/${TOPIC_ID}/retention`, { card: null });
    mockFetch.setRoute('/active-session', null);
    mockFetch.setRoute('/resume-target', { target: null });
    mockFetch.setRoute(`/topics/${TOPIC_ID}/notes`, { notes: [] });
    mockFetch.setRoute(`/topics/${TOPIC_ID}/sessions`, { sessions: [] });
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
