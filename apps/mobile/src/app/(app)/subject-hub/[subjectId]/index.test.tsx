import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import type { AllNote } from '@eduagent/schemas';

import {
  createScreenWrapper,
  createTestProfile,
} from '../../../../test-utils/screen-render';
import {
  extractJsonBody,
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../../../test-utils/mock-api-routes';
import SubjectHubRoute from './index';
import { FEATURE_FLAGS } from '../../../../lib/feature-flags';

jest.mock(
  'react-i18next',
  () => require('../../../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../../lib/api-client' /* gc1-allow: Clerk useAuth() external boundary; real api-client requires a live Hono server */,
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
let mockSearchParams: () => { subjectId?: string | string[] } = () => ({
  subjectId: SUBJECT_ID,
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams(),
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    push: mockPush,
    replace: mockReplace,
  }),
}));

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BOOK_ID = '660e8400-e29b-41d4-a716-446655440001';
const TOPIC_ID = '770e8400-e29b-41d4-a716-446655440002';
const SESSION_ID = '880e8400-e29b-41d4-a716-446655440003';

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
  }).wrapper;
}

function seedRoutes() {
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}/sessions`, {
    sessions: [
      {
        id: SESSION_ID,
        topicId: TOPIC_ID,
        topicTitle: 'Greetings',
        chapter: 'Basics',
        exchangeCount: 2,
        createdAt: '2026-06-12T10:00:00.000Z',
      },
    ],
  });
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}`, {
    book: {
      id: BOOK_ID,
      subjectId: SUBJECT_ID,
      title: 'Spanish 1',
      description: null,
      emoji: null,
      sortOrder: 1,
      topicsGenerated: true,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    topics: [
      {
        id: TOPIC_ID,
        title: 'Greetings',
        description: 'Say hello.',
        sortOrder: 1,
        relevance: 'core',
        estimatedMinutes: 20,
        bookId: BOOK_ID,
        chapter: 'Basics',
        skipped: false,
      },
    ],
    connections: [],
    status: 'IN_PROGRESS',
    completedTopicIds: [],
  });
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, {
    books: [
      {
        id: BOOK_ID,
        subjectId: SUBJECT_ID,
        title: 'Spanish 1',
        description: null,
        emoji: null,
        sortOrder: 1,
        topicsGenerated: true,
        status: 'IN_PROGRESS',
        topicCount: 1,
        completedTopicCount: 0,
        masteredTopicCount: 0,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
    topics: [],
    reviewDueCount: 0,
  });
  mockFetch.setRoute('/progress/resume-target', {
    target: {
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      topicId: TOPIC_ID,
      topicTitle: 'Greetings',
      sessionId: SESSION_ID,
      resumeFromSessionId: null,
      resumeKind: 'active_session',
      lastActivityAt: '2026-06-12T10:00:00.000Z',
      reason: 'You were in the middle of this.',
    },
  });
  mockFetch.setRoute('/notes', { notes: [], nextCursor: null });
  mockFetch.setRoute('/bookmarks', { bookmarks: [], nextCursor: null });
  mockFetch.setRoute('/subjects', {
    subjects: [
      {
        id: SUBJECT_ID,
        profileId: '990e8400-e29b-41d4-a716-446655440004',
        name: 'Spanish',
        status: 'active',
        curriculumStatus: 'ready',
        pedagogyMode: 'socratic',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
}

describe('SubjectHubRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
  });

  it('renders hub data and resumes active sessions by sessionId', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-screen');
    });
    screen.getByText('Spanish');
    screen.getByTestId('subject-hub-next-up-action');

    fireEvent.press(screen.getByTestId('subject-hub-next-up-action'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          sessionId: SESSION_ID,
        }),
      }),
    );
  });

  it('routes due-review next-up actions into the existing topic review flow', async () => {
    mockFetch.setRoute('/progress/resume-target', { target: null });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [
        {
          topicId: TOPIC_ID,
          xpStatus: 'pending',
          masteredAt: null,
          nextReviewAt: '2026-06-13T00:00:00.000Z',
        },
      ],
      reviewDueCount: 1,
    });

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-screen');
    });

    fireEvent.press(screen.getByTestId('subject-hub-next-up-action'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/topic/[topicId]',
        params: { subjectId: SUBJECT_ID, topicId: TOPIC_ID },
      }),
    );
  });

  it('renders a recoverable error when subjectId is missing', () => {
    mockSearchParams = () => ({});

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    screen.getByTestId('subject-hub-missing-param');
    fireEvent.press(screen.getByTestId('subject-hub-missing-param-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('falls back to the V2 Subjects tab when MODE_NAV_V2_ENABLED is on', () => {
    mockSearchParams = () => ({});
    const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;
    try {
      render(<SubjectHubRoute />, { wrapper: wrapper() });

      screen.getByTestId('subject-hub-missing-param');
      fireEvent.press(screen.getByTestId('subject-hub-missing-param-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/subjects');
    } finally {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    }
  });
});

// ---------------------------------------------------------------------------
// WI-942 — loading branch was a spinner-forever / dead-end. The loading state
// must time out to a retry/back affordance, and a hub that settles with no
// usable data must surface a recoverable empty state (not blank or stuck).
// ---------------------------------------------------------------------------

describe('SubjectHubRoute — no books (pick-book)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    // Subject is 'ready' (a broad subject has book *suggestions*, no book rows)
    // but the hub sees zero books → the recovery is "choose your first book",
    // not a generic dead-end.
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, { books: [] });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [],
      reviewDueCount: 0,
    });
    mockFetch.setRoute('/progress/resume-target', { target: null });
  });

  it('shows the pick-book empty state, not the hub surface', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-pick-book');
    });
    screen.getByTestId('subject-hub-pick-book-cta');
    screen.getByTestId('subject-hub-pick-book-back');
    expect(screen.queryByTestId('subject-hub-screen')).toBeNull();
  });

  it('routes to pick-book from the CTA', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-pick-book-cta');
    });
    fireEvent.press(screen.getByTestId('subject-hub-pick-book-cta'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: SUBJECT_ID },
      }),
    );
  });

  it('goes back from the empty state', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-pick-book-back');
    });
    fireEvent.press(screen.getByTestId('subject-hub-pick-book-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('replaces to the Subjects tab instead of raw back when V2 native history is misleading', async () => {
    const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;
    mockCanGoBack.mockReturnValue(true);
    try {
      render(<SubjectHubRoute />, { wrapper: wrapper() });

      await waitFor(() => {
        screen.getByTestId('subject-hub-pick-book-back');
      });

      fireEvent.press(screen.getByTestId('subject-hub-pick-book-back'));

      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/subjects');
    } finally {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    }
  });

  // [WI-1209] Legacy counterpart to the V2 test above. goBack is a single
  // un-branched function shared by all empty-state surfaces (WI-1209 AC:
  // "single behavioral variant") and no longer reads canGoBack() at all, so
  // the misleading-native-history regression applies identically regardless
  // of MODE_NAV_V2_ENABLED. Without this test, a future regression that
  // reintroduces a canGoBack()-preferring branch only under the V2-off path
  // would go undetected — the V2-on describe block below never exercises
  // this flag state.
  it('replaces to the legacy Library tab instead of raw back when native history is misleading (MODE_NAV_V2_ENABLED off)', async () => {
    const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      false;
    mockCanGoBack.mockReturnValue(true);
    try {
      render(<SubjectHubRoute />, { wrapper: wrapper() });

      await waitFor(() => {
        screen.getByTestId('subject-hub-pick-book-back');
      });

      fireEvent.press(screen.getByTestId('subject-hub-pick-book-back'));

      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    } finally {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    }
  });
});

describe('SubjectHubRoute — V2 empty-state back contract', () => {
  let originalV2: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;
  });

  afterEach(() => {
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      originalV2;
    jest.useRealTimers();
  });

  it.each([
    {
      label: 'query error state',
      testID: 'subject-hub-back',
      arrange: () => {
        seedRoutes();
        mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, () =>
          Promise.resolve(
            new Response(JSON.stringify({ message: 'Failed' }), {
              status: 500,
            }),
          ),
        );
      },
    },
    {
      label: 'loading timeout state',
      testID: 'subject-hub-back',
      arrange: () => {
        jest.useFakeTimers();
        seedRoutes();
        const neverSettlingBooks = new Promise<Response>(() => undefined);
        mockFetch.setRoute(
          `/subjects/${SUBJECT_ID}/books`,
          () => neverSettlingBooks,
        );
      },
      afterRender: async () => {
        await act(async () => {
          jest.advanceTimersByTime(15_000);
        });
        await Promise.resolve();
      },
    },
    {
      label: 'pick-book empty state',
      testID: 'subject-hub-pick-book-back',
      arrange: () => {
        seedRoutes();
        mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, { books: [] });
        mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
          topics: [],
          reviewDueCount: 0,
        });
        mockFetch.setRoute('/progress/resume-target', { target: null });
      },
    },
    {
      label: 'preparing empty state',
      testID: 'subject-hub-preparing-back',
      arrange: () => {
        seedRoutes();
        mockFetch.setRoute('/subjects', {
          subjects: [
            {
              id: SUBJECT_ID,
              profileId: '990e8400-e29b-41d4-a716-446655440004',
              name: 'Spanish',
              status: 'active',
              curriculumStatus: 'preparing',
              pedagogyMode: 'socratic',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        });
        mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, {
          books: [
            {
              id: BOOK_ID,
              subjectId: SUBJECT_ID,
              title: 'Spanish 1',
              description: null,
              emoji: null,
              sortOrder: 1,
              topicsGenerated: false,
              status: 'NOT_STARTED',
              topicCount: 0,
              completedTopicCount: 0,
              masteredTopicCount: 0,
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
          ],
        });
        mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
          topics: [],
          reviewDueCount: 0,
        });
        mockFetch.setRoute('/progress/resume-target', { target: null });
      },
    },
    {
      label: 'stuck empty state',
      testID: 'subject-hub-stuck-back',
      arrange: () => {
        seedRoutes();
        mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}`, {
          book: {
            id: BOOK_ID,
            subjectId: SUBJECT_ID,
            title: 'Spanish 1',
            description: null,
            emoji: null,
            sortOrder: 1,
            topicsGenerated: true,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
          topics: [
            {
              id: TOPIC_ID,
              title: 'Greetings',
              description: 'Say hello.',
              sortOrder: 1,
              relevance: 'core',
              estimatedMinutes: 20,
              bookId: BOOK_ID,
              chapter: 'Basics',
              skipped: true,
            },
          ],
          connections: [],
          status: 'IN_PROGRESS',
          completedTopicIds: [],
        });
        mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
          topics: [],
          reviewDueCount: 0,
        });
        mockFetch.setRoute('/progress/resume-target', { target: null });
      },
    },
  ])(
    '$label routes Back to Subjects without trusting native history',
    async ({ afterRender, arrange, testID }) => {
      arrange();
      mockCanGoBack.mockReturnValue(true);

      render(<SubjectHubRoute />, { wrapper: wrapper() });
      await afterRender?.();

      await waitFor(() => {
        screen.getByTestId(testID);
      });

      fireEvent.press(screen.getByTestId(testID));

      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/subjects');
    },
  );
});

describe('SubjectHubRoute — preparing curriculum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    // A book row exists but its topics are still generating → curriculumStatus
    // 'preparing'. The hub must show the building state, not a dead-end.
    mockFetch.setRoute('/subjects', {
      subjects: [
        {
          id: SUBJECT_ID,
          profileId: '990e8400-e29b-41d4-a716-446655440004',
          name: 'Spanish',
          status: 'active',
          curriculumStatus: 'preparing',
          pedagogyMode: 'socratic',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, {
      books: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          title: 'Spanish 1',
          description: null,
          emoji: null,
          sortOrder: 1,
          topicsGenerated: false,
          status: 'NOT_STARTED',
          topicCount: 0,
          completedTopicCount: 0,
          masteredTopicCount: 0,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [],
      reviewDueCount: 0,
    });
    mockFetch.setRoute('/progress/resume-target', { target: null });
  });

  it('shows the building state with a back affordance, not the hub or a dead-end', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-preparing');
    });
    screen.getByTestId('subject-hub-preparing-back');
    expect(screen.queryByTestId('subject-hub-screen')).toBeNull();
    expect(screen.queryByTestId('subject-hub-pick-book')).toBeNull();
  });
});

describe('SubjectHubRoute — stuck curriculum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    // A generated book exists (curriculumStatus 'ready') but every topic is
    // skipped → zero active topics. The honest recovery is a real retry that
    // re-dispatches generation, not a re-read.
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}`, {
      book: {
        id: BOOK_ID,
        subjectId: SUBJECT_ID,
        title: 'Spanish 1',
        description: null,
        emoji: null,
        sortOrder: 1,
        topicsGenerated: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      topics: [
        {
          id: TOPIC_ID,
          title: 'Greetings',
          description: 'Say hello.',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 20,
          bookId: BOOK_ID,
          chapter: 'Basics',
          skipped: true,
        },
      ],
      connections: [],
      status: 'IN_PROGRESS',
      completedTopicIds: [],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [],
      reviewDueCount: 0,
    });
    mockFetch.setRoute('/progress/resume-target', { target: null });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retry-curriculum`, {
      dispatched: 1,
    });
  });

  it('shows the stuck state and re-dispatches curriculum on retry', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-stuck');
    });
    screen.getByTestId('subject-hub-stuck-retry');
    expect(screen.queryByTestId('subject-hub-screen')).toBeNull();

    fireEvent.press(screen.getByTestId('subject-hub-stuck-retry'));

    await waitFor(() => {
      const calls = fetchCallsMatching(
        mockFetch,
        `/subjects/${SUBJECT_ID}/retry-curriculum`,
      );
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]?.init?.method).toBe('POST');
    });
  });
});

describe('SubjectHubRoute — loading timeout escape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('escapes the spinner to a retry/back affordance when the hub query stalls', async () => {
    // Route /books to a never-settling promise so the hub stays loading
    // forever. Capture the resolver so it is never called.
    let _capturedBooksResolver!: (r: Response) => void;
    const neverSettlingBooks = new Promise<Response>((resolve) => {
      _capturedBooksResolver = resolve;
    });
    mockFetch.setRoute(
      `/subjects/${SUBJECT_ID}/books`,
      () => neverSettlingBooks,
    );

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    // Pre-timeout: spinner is shown, no escape hatch yet.
    expect(screen.queryByTestId('subject-hub-retry')).toBeNull();

    // Advance past the TimeoutLoader budget (default 15s) → escape appears.
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    await Promise.resolve();

    screen.getByTestId('subject-hub-retry');
    screen.getByTestId('subject-hub-back');

    // Reference the captured resolver to satisfy TypeScript (never called).
    void _capturedBooksResolver;
  });
});

// ---------------------------------------------------------------------------
// HIGH-3 — surface a platform alert when the retry mutation fails
// ---------------------------------------------------------------------------
//
// Route-ordering note: `createRoutedMockFetch` matches by `url.includes(pattern)`.
// The pattern `/subjects` (seeded by seedRoutes) sits at an earlier Map position
// than `/subjects/${SUBJECT_ID}/retry-curriculum` and therefore matches the
// retry-curriculum URL first (both contain the substring `/subjects`). To get the
// right response we override the `/subjects` route with a function dispatcher that
// branches on the URL — updating an existing key preserves Map order so the
// dispatcher runs at the correct position.
// ---------------------------------------------------------------------------

describe('SubjectHubRoute — stuck curriculum: retry error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}`, {
      book: {
        id: BOOK_ID,
        subjectId: SUBJECT_ID,
        title: 'Spanish 1',
        description: null,
        emoji: null,
        sortOrder: 1,
        topicsGenerated: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      topics: [
        {
          id: TOPIC_ID,
          title: 'Greetings',
          description: 'Say hello.',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 20,
          bookId: BOOK_ID,
          chapter: 'Basics',
          skipped: true,
        },
      ],
      connections: [],
      status: 'IN_PROGRESS',
      completedTopicIds: [],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [],
      reviewDueCount: 0,
    });
    mockFetch.setRoute('/progress/resume-target', { target: null });
    // Override /subjects with a dispatcher: retry-curriculum POSTs get 500,
    // ordinary subjects GETs get the list. This bypasses the Map-ordering
    // ambiguity described above.
    mockFetch.setRoute('/subjects', (url: string, init?: RequestInit) => {
      if (url.includes('/retry-curriculum') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'internal error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return {
        subjects: [
          {
            id: SUBJECT_ID,
            profileId: '990e8400-e29b-41d4-a716-446655440004',
            name: 'Spanish',
            status: 'active',
            curriculumStatus: 'ready',
            pedagogyMode: 'socratic',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      };
    });
  });

  it('surfaces a platform alert when the retry mutation fails', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-stuck');
    });

    fireEvent.press(screen.getByTestId('subject-hub-stuck-retry'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    // Assert a non-empty title AND body are shown — not just that alert fired —
    // so an empty/wrong alert string can't pass green. platformAlert forwards
    // (title, message, buttons, options) to Alert.alert; check the first two.
    const [title, body] = alertSpy.mock.calls[0] ?? [];
    expect(typeof title).toBe('string');
    expect(title).toBeTruthy();
    expect(typeof body).toBe('string');
    expect(body).toBeTruthy();

    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Tier A — a persisted curriculumStatus:'failed' from /subjects routes the hub
// to the 'stuck' empty state end-to-end (useSubjectHub → computeEmptyKind).
// ---------------------------------------------------------------------------

describe('SubjectHubRoute — curriculumStatus:failed → stuck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    // A book exists but yields no usable topics (the one topic is skipped), so
    // hasUsableData is false. With curriculumStatus 'failed', computeEmptyKind
    // must resolve to 'stuck'.
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}`, {
      book: {
        id: BOOK_ID,
        subjectId: SUBJECT_ID,
        title: 'Spanish 1',
        description: null,
        emoji: null,
        sortOrder: 1,
        topicsGenerated: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      topics: [
        {
          id: TOPIC_ID,
          title: 'Greetings',
          description: 'Say hello.',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 20,
          bookId: BOOK_ID,
          chapter: 'Basics',
          skipped: true,
        },
      ],
      connections: [],
      status: 'IN_PROGRESS',
      completedTopicIds: [],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [],
      reviewDueCount: 0,
    });
    mockFetch.setRoute('/progress/resume-target', { target: null });
    mockFetch.setRoute('/subjects', {
      subjects: [
        {
          id: SUBJECT_ID,
          profileId: '990e8400-e29b-41d4-a716-446655440004',
          name: 'Spanish',
          status: 'active',
          curriculumStatus: 'failed',
          pedagogyMode: 'socratic',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('renders the stuck empty state (with a retry affordance) for a failed subject', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-stuck');
    });
    // The stuck state must offer the retry affordance, never the preparing
    // spinner or the pick-book CTA.
    expect(screen.getByTestId('subject-hub-stuck-retry')).toBeTruthy();
    expect(screen.queryByTestId('subject-hub-preparing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HIGH-2 — route to pick-book when retry-curriculum returns dispatched:0
// ---------------------------------------------------------------------------

describe('SubjectHubRoute — stuck curriculum: dispatched:0', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books/${BOOK_ID}`, {
      book: {
        id: BOOK_ID,
        subjectId: SUBJECT_ID,
        title: 'Spanish 1',
        description: null,
        emoji: null,
        sortOrder: 1,
        topicsGenerated: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      topics: [
        {
          id: TOPIC_ID,
          title: 'Greetings',
          description: 'Say hello.',
          sortOrder: 1,
          relevance: 'core',
          estimatedMinutes: 20,
          bookId: BOOK_ID,
          chapter: 'Basics',
          skipped: true,
        },
      ],
      connections: [],
      status: 'IN_PROGRESS',
      completedTopicIds: [],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [],
      reviewDueCount: 0,
    });
    mockFetch.setRoute('/progress/resume-target', { target: null });
    // Override /subjects with a dispatcher: retry-curriculum POSTs get
    // dispatched:0, ordinary subjects GETs get the list. See note above.
    mockFetch.setRoute('/subjects', (url: string) => {
      if (url.includes('/retry-curriculum')) {
        return { dispatched: 0 };
      }
      return {
        subjects: [
          {
            id: SUBJECT_ID,
            profileId: '990e8400-e29b-41d4-a716-446655440004',
            name: 'Spanish',
            status: 'active',
            curriculumStatus: 'ready',
            pedagogyMode: 'socratic',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      };
    });
  });

  it('routes to pick-book when retry-curriculum returns dispatched:0', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-stuck');
    });

    fireEvent.press(screen.getByTestId('subject-hub-stuck-retry'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/pick-book/[subjectId]',
          params: { subjectId: SUBJECT_ID },
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// WI-1118 — writable topic-scoped notes (felt-knowing loop Flow 1).
// Opening a topic surfaces the add-note input (canStudy + handler wired);
// submitting POSTs to the topic-scoped notes endpoint with the focused topic id.
// No new endpoint, no migration — notes stay topic-scoped (the loose/topicless
// note bucket the WI's original AC proposed was refuted by the spec).
//
// Route-ordering note (see HIGH-3 block above): the mock matches by
// `url.includes(pattern)` and `/notes` (the all-notes GET) sits earlier in Map
// order than any `/subjects/.../topics/.../notes` POST. Override `/notes` with a
// dispatcher so the POST returns a created note while the GET returns the list.
// ---------------------------------------------------------------------------

describe('SubjectHubRoute — writable hub notes (WI-1118)', () => {
  // The created note is reflected on subsequent GET /notes so the
  // invalidate→refetch chain (useCreateNote.onSuccess) actually surfaces the new
  // note in the open topic sheet — not just a fire-and-forget POST.
  let createdNote: AllNote | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    createdNote = null;
    mockFetch.setRoute('/notes', (url: string, init?: RequestInit) => {
      if (
        url.includes(`/topics/${TOPIC_ID}/notes`) &&
        init?.method === 'POST'
      ) {
        createdNote = {
          id: 'aa0e8400-e29b-41d4-a716-446655440099',
          topicId: TOPIC_ID,
          topicTitle: 'Greetings',
          bookId: BOOK_ID,
          bookTitle: 'Spanish 1',
          subjectId: SUBJECT_ID,
          subjectName: 'Spanish',
          sessionId: null,
          content: 'mitosis has phases',
          origin: 'self',
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        };
        return {
          note: {
            id: createdNote.id,
            topicId: TOPIC_ID,
            content: 'mitosis has phases',
            origin: 'self',
            createdAt: '2026-06-29T00:00:00.000Z',
            updatedAt: '2026-06-29T00:00:00.000Z',
          },
        };
      }
      // GET /notes — surface the created note once it exists so the refetch the
      // mutation triggers re-renders the open sheet with the persisted note.
      return { notes: createdNote ? [createdNote] : [], nextCursor: null };
    });
  });

  it('opens a topic, persists a trimmed note bound to that topic, and shows it', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-screen');
    });

    // The subject-level notes section is read-only — no add input until a topic is
    // focused (spec: "no focused topic → no add input").
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();

    fireEvent.press(screen.getByTestId(`subject-hub-topic-${TOPIC_ID}`));

    const input = screen.getByTestId('subject-hub-notes-input');
    fireEvent.changeText(input, '  mitosis has phases  ');
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      const calls = fetchCallsMatching(
        mockFetch,
        `/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/notes`,
      );
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]?.init?.method).toBe('POST');
      // The body carries the trimmed content (blank/whitespace is a no-op gate).
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
        content: 'mitosis has phases',
      });
    });

    // Input clears after a successful submit.
    expect(screen.getByTestId('subject-hub-notes-input').props.value).toBe('');

    // The note is not just POSTed — the cache invalidation refetches and the new
    // note renders inside the focused topic sheet (end-to-end, no manual refresh).
    await waitFor(() => {
      const sheet = screen.getByTestId('subject-hub-topic-sheet');
      within(sheet).getByText('mitosis has phases');
    });
  });
});

// A failed save must not be silent. SubjectHubNotesSection clears the draft
// optimistically on submit, so the route-level onError alert is the ONLY signal
// the learner's text was not persisted. Override the topic-notes POST to 500.
describe('SubjectHubRoute — writable hub notes: save error (WI-1118)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    mockFetch.setRoute('/notes', (url: string, init?: RequestInit) => {
      if (
        url.includes(`/topics/${TOPIC_ID}/notes`) &&
        init?.method === 'POST'
      ) {
        return new Response(JSON.stringify({ error: 'internal error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { notes: [], nextCursor: null };
    });
  });

  it('surfaces a platform alert when a note save fails (no silent draft loss)', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-screen');
    });

    fireEvent.press(screen.getByTestId(`subject-hub-topic-${TOPIC_ID}`));

    const input = screen.getByTestId('subject-hub-notes-input');
    fireEvent.changeText(input, 'mitosis has phases');
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    // Assert a non-empty title AND body — not just that alert fired — so an
    // empty/wrong alert string can't pass green.
    const [title, body] = alertSpy.mock.calls[0] ?? [];
    expect(typeof title).toBe('string');
    expect(title).toBeTruthy();
    expect(typeof body).toBe('string');
    expect(body).toBeTruthy();

    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// MEDIUM-2 — preparing state passes subjectName to SubjectHubPreparing
// ---------------------------------------------------------------------------

describe('SubjectHubRoute — preparing: personalized title', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
    mockFetch.setRoute('/subjects', {
      subjects: [
        {
          id: SUBJECT_ID,
          profileId: '990e8400-e29b-41d4-a716-446655440004',
          name: 'Spanish',
          status: 'active',
          curriculumStatus: 'preparing',
          pedagogyMode: 'socratic',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, {
      books: [
        {
          id: BOOK_ID,
          subjectId: SUBJECT_ID,
          title: 'Spanish 1',
          description: null,
          emoji: null,
          sortOrder: 1,
          topicsGenerated: false,
          status: 'NOT_STARTED',
          topicCount: 0,
          completedTopicCount: 0,
          masteredTopicCount: 0,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/retention`, {
      topics: [],
      reviewDueCount: 0,
    });
    mockFetch.setRoute('/progress/resume-target', { target: null });
  });

  it('renders the personalized preparing title with the subject name', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-preparing');
    });

    // mock-i18n resolves against real en.json — the named key interpolated with
    // 'Spanish' produces the English string below.
    screen.getByText('Building your Spanish curriculum…');
  });
});

// ---------------------------------------------------------------------------
// WI-1119 — the hub previously had no in-context manage/pause/archive entry
// (only Library did). The entry must be present for a learner/owner scope and
// must drive the same status mutation Library uses, and must be hidden for a
// supporter-proxy scope (read-only over the child's subjects).
// ---------------------------------------------------------------------------

function proxyWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
    isExplicitProxyMode: true,
  }).wrapper;
}

describe('SubjectHubRoute — manage entry (WI-1119)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
    seedRoutes();
  });

  it('shows the manage entry for the learner scope and archives via the sheet', async () => {
    render(<SubjectHubRoute />, { wrapper: wrapper() });

    // The entry appears once the subject status query resolves (active).
    await waitFor(() => {
      screen.getByTestId('subject-hub-manage');
    });

    fireEvent.press(screen.getByTestId('subject-hub-manage'));
    // Active subject → archive-first action set (pause + archive).
    screen.getByTestId('subject-hub-pause');
    fireEvent.press(screen.getByTestId('subject-hub-archive'));

    await waitFor(() => {
      const patches = fetchCallsMatching(
        mockFetch,
        `/subjects/${SUBJECT_ID}`,
      ).filter((call) => call.init?.method === 'PATCH');
      expect(patches).toHaveLength(1);
      expect(extractJsonBody(patches[0]!.init)).toEqual({ status: 'archived' });
    });
  });

  it('shows the resume action set for a paused subject', async () => {
    // Deep-linked paused subject: the manage entry must reflect the real status
    // (resume + archive), not the 'active' fallback (pause + archive).
    mockFetch.setRoute('/subjects', {
      subjects: [
        {
          id: SUBJECT_ID,
          profileId: '990e8400-e29b-41d4-a716-446655440004',
          name: 'Spanish',
          status: 'paused',
          curriculumStatus: 'ready',
          pedagogyMode: 'socratic',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    render(<SubjectHubRoute />, { wrapper: wrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-manage');
    });

    fireEvent.press(screen.getByTestId('subject-hub-manage'));
    screen.getByTestId('subject-hub-resume');
    screen.getByTestId('subject-hub-archive');
    expect(screen.queryByTestId('subject-hub-pause')).toBeNull();
  });

  it('hides the manage entry for a supporter-proxy scope', async () => {
    render(<SubjectHubRoute />, { wrapper: proxyWrapper() });

    await waitFor(() => {
      screen.getByTestId('subject-hub-screen');
    });

    expect(screen.queryByTestId('subject-hub-manage')).toBeNull();
  });
});
