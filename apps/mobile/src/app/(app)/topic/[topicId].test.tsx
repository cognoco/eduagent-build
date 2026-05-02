import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoutedMockFetch } from '../../../test-utils/mock-api-routes';

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch assigned inside factory to bypass hoisting
// ---------------------------------------------------------------------------

let mockFetch: RoutedMockFetch;

jest.mock('../../../lib/api-client', () => {
  const { createRoutedMockFetch, mockApiClientFactory } = require('../../../test-utils/mock-api-routes');
  mockFetch = createRoutedMockFetch();
  return mockApiClientFactory(mockFetch);
});

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: {
      id: 'test-profile-id',
      accountId: 'test-account-id',
      displayName: 'Test Learner',
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
    },
  }),
  ProfileContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

// ---------------------------------------------------------------------------
// External / rendering mocks (kept — not API hooks)
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockPushLearningResumeTarget = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({
  subjectId: 's1',
  topicId: 't1',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
    muted: '#888888',
    retentionWeak: '#ff0000',
    retentionFading: '#ffaa00',
    retentionStrong: '#00ff00',
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  pushLearningResumeTarget: (...args: unknown[]) =>
    mockPushLearningResumeTarget(...args),
}));

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
};

const DEFAULT_RETENTION_CARD = {
  topicId: 't1',
  failureCount: 0,
  repetitions: 0,
  easeFactor: 2.5,
  nextReviewAt: null,
  lastReviewedAt: null,
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
  evaluateEligible?: boolean;
  repetitions?: number;
  easeFactor?: number;
  nextReviewAt?: string | null;
  activeSessionId?: string | null;
  progressOverride?: object | null;
  retentionOverride?: object | null;
  parkingLotItems?: object[];
  resumeTarget?: object | null;
  resolveResult?: object | null | false;
}

function setupRoutes(opts: SetupOptions = {}) {
  const {
    completionStatus = 'not_started',
    failureCount = 0,
    struggleStatus = 'normal',
    evaluateEligible = false,
    repetitions = 0,
    easeFactor = 2.5,
    nextReviewAt = null,
    activeSessionId = null,
    progressOverride,
    retentionOverride,
    parkingLotItems = [],
    resumeTarget = null,
    resolveResult = false,
  } = opts;

  // GET /subjects/s1/topics/t1/progress → { topic }
  mockFetch.setRoute('/topics/t1/progress', {
    topic: progressOverride !== undefined
      ? progressOverride
      : { ...DEFAULT_TOPIC_PROGRESS, completionStatus, struggleStatus },
  });

  // GET /topics/t1/retention → { card }
  mockFetch.setRoute('/topics/t1/retention', {
    card: retentionOverride !== undefined
      ? retentionOverride
      : { ...DEFAULT_RETENTION_CARD, failureCount, repetitions, easeFactor, nextReviewAt },
  });

  // GET /topics/t1/evaluate-eligibility → EvaluateEligibility
  mockFetch.setRoute('/evaluate-eligibility', {
    eligible: evaluateEligible,
    topicId: 't1',
    topicTitle: 'Algebra',
    currentRung: 1,
    easeFactor,
    repetitions,
  });

  // GET /progress/topic/t1/active-session → { sessionId } | null
  mockFetch.setRoute('/active-session',
    activeSessionId ? { sessionId: activeSessionId } : null
  );

  // GET /subjects/s1/topics/t1/parking-lot → { items }
  mockFetch.setRoute('/parking-lot', { items: parkingLotItems });

  // GET /subjects/s1/topics/t1/note → { note }
  mockFetch.setRoute('/note', { note: null });

  // GET /progress/resume-target → { target }
  mockFetch.setRoute('/resume-target', { target: resumeTarget });

  // GET /topics/t1/resolve → resolve result (false means don't set)
  if (resolveResult !== false) {
    mockFetch.setRoute('/resolve', resolveResult);
  }
}

// ---------------------------------------------------------------------------
// QueryClient wrapper
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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
    mockUseLocalSearchParams.mockReturnValue({ subjectId: 's1', topicId: 't1' });
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
      new Response(
        JSON.stringify({ topic: { ...DEFAULT_TOPIC_PROGRESS } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  });

  it('shows "Start learning" as primary for not_started topics', async () => {
    setupRoutes({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('primary-action-button');
    });
    screen.getByText('Start learning');
  });

  it('navigates into a new learning session from the start button', async () => {
    setupRoutes({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('primary-action-button');
    });
    fireEvent.press(screen.getByTestId('primary-action-button'));

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

  it('shows "Continue learning" as primary for in_progress topics', async () => {
    setupRoutes({ completionStatus: 'in_progress', activeSessionId: 'session-123' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Continue learning');
    });
    fireEvent.press(screen.getByTestId('primary-action-button'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 's1',
        topicId: 't1',
        topicName: 'Algebra',
        sessionId: 'session-123',
      },
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
      screen.getByTestId('primary-action-button');
    });
    fireEvent.press(screen.getByTestId('primary-action-button'));
    expect(mockPushLearningResumeTarget).toHaveBeenCalledWith(
      expect.anything(),
      target
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows "Relearn" as primary when the learner is struggling', async () => {
    setupRoutes({
      completionStatus: 'completed',
      failureCount: 3,
      struggleStatus: 'needs_deepening',
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Relearn');
    });
  });

  it('shows "Review" as primary when a completed topic is overdue', async () => {
    setupRoutes({
      completionStatus: 'completed',
      nextReviewAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Review');
    });
  });

  it('hides the secondary section when no secondary actions apply', async () => {
    setupRoutes({ completionStatus: 'not_started' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('primary-action-button');
    });
    expect(screen.queryByTestId('more-ways-toggle')).toBeNull();
  });

  it('shows expandable secondary section with Recall Check', async () => {
    setupRoutes({ completionStatus: 'in_progress' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('more-ways-toggle');
    });
    fireEvent.press(screen.getByTestId('more-ways-toggle'));
    screen.getByText('Recall Check');
    fireEvent.press(screen.getByTestId('secondary-recall-check'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/recall-test',
      params: {
        subjectId: 's1',
        topicId: 't1',
        topicName: 'Algebra',
      },
    });
  });

  it('shows Challenge yourself when eligible', async () => {
    setupRoutes({ completionStatus: 'completed', evaluateEligible: true });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('more-ways-toggle');
    });
    fireEvent.press(screen.getByTestId('more-ways-toggle'));
    screen.getByText('Challenge yourself');
  });

  it('shows Teach it back when retention qualifies', async () => {
    setupRoutes({
      completionStatus: 'completed',
      repetitions: 3,
      easeFactor: 2.5,
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('more-ways-toggle');
    });
    fireEvent.press(screen.getByTestId('more-ways-toggle'));
    screen.getByText('Teach it back');
  });
});

// ---------------------------------------------------------------------------
// UX resilience: error, empty, missing-params states
// ---------------------------------------------------------------------------

describe('TopicDetailScreen error / empty / missing-params states', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ subjectId: 's1', topicId: 't1' });
    setupRoutes();
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  it('shows missing-params state when route params are absent', async () => {
    mockUseLocalSearchParams.mockReturnValue(
      {} as { subjectId: string; topicId: string }
    );

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    // Missing params renders immediately without data fetch
    screen.getByTestId('topic-detail-missing-params-back');
    screen.getByText('Topic not found');

    fireEvent.press(screen.getByTestId('topic-detail-missing-params-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalled();
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
          { status: 500 }
        )
      )
    );
    mockFetch.setRoute('/topics/t1/retention', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Retention error' }), { status: 500 })
      )
    );

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-retry');
    });
    screen.getByTestId('topic-detail-go-back');
    screen.getByTestId('topic-detail-go-home');
    screen.getByText("We couldn't load this topic");

    fireEvent.press(screen.getByTestId('topic-detail-go-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalled();
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
        JSON.stringify({ subjectId: 's1', subjectName: 'Mathematics', topicTitle: 'Algebra' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
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
      screen.getByTestId('primary-action-button');
    });
    screen.getByText('Continue learning');
  });
});

// ---------------------------------------------------------------------------
// Rendering: retention details, parking lot, back navigation
// ---------------------------------------------------------------------------

describe('TopicDetailScreen rendering details', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ subjectId: 's1', topicId: 't1' });
    setupRoutes();
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  it('renders retention card with interval, repetitions, and next review', async () => {
    mockFetch.setRoute('/topics/t1/progress', {
      topic: {
        topicId: 't1',
        title: 'Algebra Basics',
        description: 'Introduction to algebraic expressions',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: 0.85,
        summaryExcerpt: 'Learned about variables and equations',
        xpStatus: 'verified',
      },
    });
    mockFetch.setRoute('/topics/t1/retention', {
      card: {
        topicId: 't1',
        easeFactor: 2.7,
        intervalDays: 14,
        repetitions: 5,
        nextReviewAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        lastReviewedAt: null,
        xpStatus: 'verified',
        failureCount: 0,
      },
    });
    mockFetch.setRoute('/parking-lot', {
      items: [
        {
          id: 'parked-1',
          question: 'Why does factoring help here?',
          explored: false,
          createdAt: '2026-02-15T10:00:00.000Z',
        },
      ],
    });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Algebra Basics');
    });
    expect(
      screen.getByText('Introduction to algebraic expressions')
    ).toBeTruthy();
    screen.getByText('Completed');
    screen.getByText('85%');
    screen.getByText('14 days');
    screen.getByText('5');
    expect(
      screen.getByText('Learned about variables and equations')
    ).toBeTruthy();
    screen.getByText('Parking Lot');
    screen.getByText('Why does factoring help here?');
  });

  it('shows struggle status when not normal', async () => {
    mockFetch.setRoute('/topics/t1/progress', {
      topic: {
        topicId: 't1',
        title: 'Calculus',
        description: 'Derivatives and integrals',
        completionStatus: 'in_progress',
        retentionStatus: 'weak',
        struggleStatus: 'needs_deepening',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
    });
    mockFetch.setRoute('/topics/t1/retention', { card: null });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByText('Exploring further');
    });
  });

  it('navigates back on back button press', async () => {
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    fireEvent.press(screen.getByTestId('topic-detail-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalled();
  });

  it('does not show parked questions when parking lot is empty', async () => {
    mockFetch.setRoute('/parking-lot', { items: [] });
    setupRoutes({ completionStatus: 'completed' });

    render(<TopicDetailScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      screen.getByTestId('topic-detail-back');
    });
    expect(screen.queryByText('Why does factoring help here?')).toBeNull();
  });
});
