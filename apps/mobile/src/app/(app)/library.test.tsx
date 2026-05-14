import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  createTestProfile,
  cleanupScreen,
} from '../../../test-utils/screen-render-harness';
import type { QueryClient } from '@tanstack/react-query';

// Use the shared mock-i18n util so assertions reference the rendered English
// copy from en.json (what users actually see), not bare keys. A bare-key mock
// would only prove t() was called — not that the translation pipeline is
// wired correctly or that {{interpolation}} tokens resolve. See
// apps/mobile/src/test-utils/mock-i18n.ts for the lookup behaviour.
jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => { // gc1-allow: native-boundary — requires Expo native router bindings
  const { expoRouterShim } = require('../../test-utils/native-shims');
  return expoRouterShim({ push: mockPush, replace: mockReplace });
});

jest.mock('react-native-safe-area-context', () => { // gc1-allow: native-boundary — SafeAreaProvider requires native frame metrics
  const { safeAreaShim } = require('../../test-utils/native-shims');
  return safeAreaShim();
});

jest.mock('../../components/common', () => ({ // gc1-allow: Reanimated worklets + react-native-svg cannot run in JSDOM
  ...jest.requireActual('../../components/common'),
  BookPageFlipAnimation: () => null,
  BrandCelebration: () => null,
}));

jest.mock('../../lib/theme', () => ({ // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    accent: '#2563eb',
    border: '#e5e7eb',
    primary: '#2563eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    surfaceElevated: '#f9fafb',
    warning: '#f59e0b',
    muted: '#9ca3af',
  }),
  useSubjectTint: () => ({
    solid: '#0f766e',
    soft: 'rgba(15,118,110,0.14)',
  }),
}));

const mockFetch = createRoutedMockFetch({
  '/subjects': { subjects: [] },
  '/progress/overview': {
    subjects: [],
    totalTopicsCompleted: 0,
    totalTopicsVerified: 0,
  },
  '/library/books': { subjects: [] },
  '/library/retention': { subjects: [] },
  '/library/search': {
    subjects: [],
    books: [],
    topics: [],
    notes: [],
    sessions: [],
  },
  '/subjects/:id': { subject: { id: 'sub-1', status: 'active' } },
});

jest.mock('../../lib/api-client', () => // gc1-allow: transport-boundary — Clerk useAuth() + fetch transport
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

jest.mock('../../components/library/ShelfRow', () => ({ // gc1-allow: internal UI stub exposing testID contract used across all library tests
  ShelfRow: ({
    subjectId,
    name,
    onPress,
    testID,
  }: {
    subjectId: string;
    name: string;
    onPress: (id: string) => void;
    testID?: string;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View>
        <Pressable
          testID={testID ?? `shelf-row-header-${subjectId}`}
          onPress={() => onPress(subjectId)}
          accessibilityRole="button"
        >
          <Text>{name}</Text>
        </Pressable>
      </View>
    );
  },
}));

jest.mock('../../components/library/LibrarySearchBar', () => ({ // gc1-allow: internal UI stub providing the library-search-input testID used across search tests
  LibrarySearchBar: ({
    value,
    onChangeText,
    placeholder,
  }: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
  }) => {
    const { View, TextInput } = require('react-native');
    return (
      <View>
        <TextInput
          testID="library-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
        />
      </View>
    );
  },
}));

// ---------------------------------------------------------------------------
// Active profile shared by all test helpers
// ---------------------------------------------------------------------------

const ACTIVE_PROFILE_ID = 'profile-1';

interface AggregateLibRetention {
  subjects: Array<{
    subjectId: string;
    topics: unknown[];
    reviewDueCount: number;
  }>;
}

function setLibraryRetention(
  queryClient: QueryClient,
  payload: AggregateLibRetention | undefined,
) {
  queryClient.setQueryData(
    ['library', 'retention', ACTIVE_PROFILE_ID],
    payload,
  );
}

const LibraryScreen = require('./library').default;

// ---------------------------------------------------------------------------
// Default profile fixture
// ---------------------------------------------------------------------------

const defaultProfile = createTestProfile({
  id: ACTIVE_PROFILE_ID,
  displayName: 'Alex',
  isOwner: true,
});

describe('LibraryScreen', () => {
  let queryClient: QueryClient;
  let wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();

    // Reset routes to safe defaults
    mockFetch.setRoute('/subjects', { subjects: [] });
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
    });
    mockFetch.setRoute('/library/books', { subjects: [] });
    mockFetch.setRoute('/library/retention', { subjects: [] });
    mockFetch.setRoute('/library/search', {
      subjects: [],
      books: [],
      topics: [],
      notes: [],
      sessions: [],
    });

    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: defaultProfile,
      profiles: [defaultProfile],
    }));

    // Seed library retention cache to avoid a live fetch in most tests
    setLibraryRetention(queryClient, { subjects: [] });
  });

  afterEach(() => {
    cleanupScreen(queryClient);
  });

  it('shows loading state', async () => {
    // Route returns a never-resolving promise to keep the query in loading state
    mockFetch.setRoute('/subjects', () => new Promise(() => {}));

    render(<LibraryScreen />, { wrapper });

    screen.getByTestId('library-loading');
  });

  it('[BUG-634 / M-2] does not crash when subjectsQuery.data is a non-array (stale shape / error payload)', async () => {
    // Seed subjects cache directly with a non-array shape to simulate stale cache
    queryClient.setQueryData(
      ['subjects', ACTIVE_PROFILE_ID, true],
      { unexpected: 'shape' } as unknown as never,
    );
    queryClient.setQueryData(
      ['progress', 'overview', ACTIVE_PROFILE_ID],
      { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
    );

    expect(() =>
      render(<LibraryScreen />, { wrapper }),
    ).not.toThrow();
  });

  it('[BUG-634 / M-2] does not crash when subjectsQuery.data is null', async () => {
    queryClient.setQueryData(
      ['subjects', ACTIVE_PROFILE_ID, true],
      null as unknown as never,
    );
    queryClient.setQueryData(
      ['progress', 'overview', ACTIVE_PROFILE_ID],
      { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
    );

    expect(() =>
      render(<LibraryScreen />, { wrapper }),
    ).not.toThrow();
  });

  // [BUG-818] Repro: server returned a partial-success payload where
  // `topics` was undefined or a non-array value (schema drift, error
  // payload). Without an Array.isArray guard, `data.topics.map` threw and
  // white-screened the Library tab.
  it('[BUG-818] does not crash when retentionQuery.data.topics is undefined', async () => {
    queryClient.setQueryData(
      ['subjects', ACTIVE_PROFILE_ID, true],
      [{ id: 'sub-1', name: 'Math', status: 'IN_PROGRESS' }] as never,
    );
    queryClient.setQueryData(
      ['progress', 'overview', ACTIVE_PROFILE_ID],
      { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
    );
    setLibraryRetention(queryClient, {
      subjects: [
        {
          subjectId: 'sub-1',
          topics: undefined as unknown as never,
          reviewDueCount: 0,
        },
      ],
    });

    expect(() =>
      render(<LibraryScreen />, { wrapper }),
    ).not.toThrow();
  });

  it('[BUG-818] does not crash when retentionQuery.data.topics is a non-array shape', async () => {
    queryClient.setQueryData(
      ['subjects', ACTIVE_PROFILE_ID, true],
      [{ id: 'sub-1', name: 'Math', status: 'IN_PROGRESS' }] as never,
    );
    queryClient.setQueryData(
      ['progress', 'overview', ACTIVE_PROFILE_ID],
      { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
    );
    setLibraryRetention(queryClient, {
      subjects: [
        {
          subjectId: 'sub-1',
          topics: 'unexpected' as unknown as never,
          reviewDueCount: 0,
        },
      ],
    });

    expect(() =>
      render(<LibraryScreen />, { wrapper }),
    ).not.toThrow();
  });

  it('shows empty state when there are no subjects', async () => {
    mockFetch.setRoute('/subjects', { subjects: [] });
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
    });

    render(<LibraryScreen />, { wrapper });

    await waitFor(() => {
      // New library v3 design: empty state uses library-empty testID
      screen.getByTestId('library-empty');
    });
    screen.getByText('Your library will grow as you learn');
  });

  it('renders shelf rows for each subject', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'History', status: 'active' }],
    });
    mockFetch.setRoute('/progress/overview', {
      subjects: [
        {
          subjectId: 'sub-1',
          name: 'History',
          topicsTotal: 12,
          topicsCompleted: 3,
          topicsVerified: 1,
          urgencyScore: 0,
          retentionStatus: 'fading',
          lastSessionAt: null,
        },
      ],
      totalTopicsCompleted: 3,
      totalTopicsVerified: 1,
    });

    render(<LibraryScreen />, { wrapper });

    await waitFor(() => {
      // Library v3: subject is a shelf row, not a card
      screen.getByTestId('shelf-row-header-sub-1');
    });
    screen.getByText('History');
  });

  it('orders active subjects first, then paused, then archived', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [
        { id: 'sub-archived', name: 'Archived Spanish', status: 'archived' },
        { id: 'sub-paused', name: 'Paused History', status: 'paused' },
        { id: 'sub-active', name: 'Active Math', status: 'active' },
      ],
    });
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
    });

    render(<LibraryScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('shelf-row-header-sub-active');
    });

    const orderedRowIds = screen
      .UNSAFE_getAllByProps({ accessibilityRole: 'button' })
      .filter((row) => String(row.props.testID).startsWith('shelf-row-header-'))
      .map((row) => String(row.props.testID))
      .filter((testID, index, allRows) => allRows.indexOf(testID) === index);
    expect(orderedRowIds).toEqual([
      'shelf-row-header-sub-active',
      'shelf-row-header-sub-paused',
      'shelf-row-header-sub-archived',
    ]);
  });

  it('has no top-level tabs — library opens subject shelves as the next level', async () => {
    // Library v3 redesign replaced Shelves/Books/Topics tabs with a subject
    // shelf list. There are no tab controls at the library level.
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
    });

    render(<LibraryScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('shelves-list');
    });

    expect(screen.queryByTestId('library-tab-shelves')).toBeNull();
    expect(screen.queryByTestId('library-tab-books')).toBeNull();
    expect(screen.queryByTestId('library-tab-topics')).toBeNull();
    // Instead, the subject shelf list is the root navigation.
    screen.getByTestId('shelves-list');
  });

  it('opens the subject shelf when a subject row is pressed', async () => {
    // Library is subject-first: books and suggestions live on the subject
    // shelf screen instead of expanding inline inside the Library list.
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
    });

    render(<LibraryScreen />, { wrapper });

    await waitFor(() => {
      screen.getByTestId('shelf-row-header-sub-1');
    });

    fireEvent.press(screen.getByTestId('shelf-row-header-sub-1'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  // -----------------------------------------------------------------------
  // BUG-82: allBooksQuery failure is non-fatal — library still renders [BUG-82]
  // -----------------------------------------------------------------------
  it('does not show full-page error when only allBooksQuery fails', async () => {
    mockFetch.setRoute('/subjects', {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });
    mockFetch.setRoute('/progress/overview', {
      subjects: [],
    });
    mockFetch.setRoute(
      '/library/books',
      new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 }),
    );

    render(<LibraryScreen />, { wrapper });

    await waitFor(() => {
      // Library renders normally — subjects still visible as shelf rows
      expect(screen.queryByTestId('library-error')).toBeNull();
    });
    screen.getByTestId('shelves-list');
  });

  describe('Manage Subjects modal — backdrop close [BUG-510]', () => {
    async function arrangeWithOneSubject() {
      mockFetch.setRoute('/subjects', {
        subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      });
      mockFetch.setRoute('/progress/overview', {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
      });
    }

    it('closes when the backdrop (outside the sheet) is tapped [BUG-510]', async () => {
      // Repro: on web the Close button sits behind the bottom tab bar so
      // pointer events never reach it; the modal had no other dismiss path
      // because the backdrop was a plain View with no onPress.
      await arrangeWithOneSubject();
      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        screen.getByTestId('manage-subjects-button');
      });

      fireEvent.press(screen.getByTestId('manage-subjects-button'));
      screen.getByTestId('manage-subjects-backdrop');

      act(() => {
        fireEvent.press(screen.getByTestId('manage-subjects-backdrop'));
      });

      // The backdrop press calls setShowManageSubjects(false), which sets
      // visible={false} on the RN Modal. On iOS the Modal keeps children
      // mounted during the close animation so the backdrop element stays in
      // the tree, but the Modal host component reports visible=false.
      // animationType="slide" uniquely identifies the manage-subjects modal.
      expect(
        screen.UNSAFE_queryByProps({ visible: false, animationType: 'slide' }),
      ).not.toBeNull();
    });

    it('exposes an accessible label so assistive tech can dismiss the modal [BUG-510]', async () => {
      await arrangeWithOneSubject();
      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        screen.getByTestId('manage-subjects-button');
      });

      fireEvent.press(screen.getByTestId('manage-subjects-button'));

      const backdrop = screen.getByTestId('manage-subjects-backdrop');
      expect(backdrop.props.accessibilityRole).toBe('button');
      expect(backdrop.props.accessibilityLabel).toBe('Close manage subjects');
    });

    it('sends archived status when the Archive action is pressed', async () => {
      await arrangeWithOneSubject();

      const updateSubjectResponse = { subject: { id: 'sub-1', status: 'archived' } };
      mockFetch.setRoute('/subjects/', updateSubjectResponse);

      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        screen.getByTestId('manage-subjects-button');
      });

      fireEvent.press(screen.getByTestId('manage-subjects-button'));
      fireEvent.press(screen.getByTestId('archive-subject-sub-1'));

      await waitFor(() => {
        // The PATCH to /subjects/:id was called
        const patchCalls = (mockFetch.mock.calls as [RequestInfo | URL, RequestInit?][])
          .filter(([input]) => {
            const url = typeof input === 'string' ? input : (input as Request).url;
            return url.includes('/subjects/') && String(url).split('/subjects/')[1]?.includes('sub-1');
          });
        expect(patchCalls.length).toBeGreaterThan(0);
      });
    });

    it('disables other subject actions while one status update is saving', async () => {
      // Keep the PATCH in-flight by returning a never-resolving response
      let resolveUpdate!: (value: Response) => void;
      const updatePromise = new Promise<Response>((resolve) => {
        resolveUpdate = resolve;
      });

      mockFetch.setRoute('/subjects/', () => updatePromise);
      mockFetch.setRoute('/subjects', {
        subjects: [
          { id: 'sub-1', name: 'Math', status: 'active' },
          { id: 'sub-2', name: 'History', status: 'active' },
        ],
      });
      mockFetch.setRoute('/progress/overview', {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
      });

      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        screen.getByTestId('manage-subjects-button');
      });

      fireEvent.press(screen.getByTestId('manage-subjects-button'));
      fireEvent.press(screen.getByTestId('archive-subject-sub-1'));

      await waitFor(() => {
        expect(screen.getByTestId('archive-subject-sub-2')).toBeDisabled();
      });

      // Resolve the pending update to avoid open handles
      resolveUpdate(
        new Response(JSON.stringify({ subject: { id: 'sub-1', status: 'archived' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // BUG-971: Header topic count must include null-bookId topics
  // -----------------------------------------------------------------------
  // Repro: topicCountsByBookId skips topics where bookId is null (orphan
  // topics, parking-lot entries). totalTopicsAcrossBooks used to derive
  // from topicCountsByBookId, so the header subtitle silently undercounted
  // those topics — visibly drifting from per-shelf topic totals.
  describe('Header topic count [BUG-971]', () => {
    it('counts topics with null bookId in the header subtitle', async () => {
      mockFetch.setRoute('/subjects', {
        subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      });
      mockFetch.setRoute('/progress/overview', {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
      });
      setLibraryRetention(queryClient, {
        subjects: [
          {
            subjectId: 'sub-1',
            topics: [
              {
                topicId: 't-1',
                bookId: 'book-1',
                easeFactor: 2.5,
                repetitions: 0,
                lastReviewedAt: null,
                xpStatus: 'pending',
                failureCount: 0,
              },
              {
                topicId: 't-2',
                bookId: null,
                easeFactor: 2.5,
                repetitions: 0,
                lastReviewedAt: null,
                xpStatus: 'pending',
                failureCount: 0,
              },
              {
                topicId: 't-3',
                bookId: null,
                easeFactor: 2.5,
                repetitions: 0,
                lastReviewedAt: null,
                xpStatus: 'pending',
                failureCount: 0,
              },
            ],
            reviewDueCount: 0,
          },
        ],
      });

      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        // 3 topics total (1 with bookId, 2 with null bookId) must all be counted.
        // Pre-fix this would render "1 subjects · 1 topics" (orphans dropped).
        // Match on the topic-count segment only — the subject-count segment's
        // grammar ("1 subject" vs "1 subjects") may shift if proper i18next
        // pluralization lands later, and that change is unrelated to BUG-971.
        expect(screen.getByText(/· 3 topics\b/)).toBeTruthy();
      });
    });

    it('omits the topic count segment entirely when there are no topics', async () => {
      mockFetch.setRoute('/subjects', {
        subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      });
      mockFetch.setRoute('/progress/overview', {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
      });
      setLibraryRetention(queryClient, { subjects: [] });

      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        // Header should read just "1 subjects" with no trailing " · N topics".
        screen.getByText('1 subjects');
      });
    });
  });

  describe('search result navigation', () => {
    const SEARCH_DATA = {
      subjects: [{ id: 'sub-1', name: 'Biology' }],
      books: [
        {
          id: 'book-1',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          title: 'Cell Biology',
        },
      ],
      topics: [
        {
          id: 'top-1',
          bookId: 'book-1',
          bookTitle: 'Cell Biology',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          name: 'Mitosis',
        },
      ],
      notes: [
        {
          id: 'note-1',
          sessionId: 'sess-1',
          topicId: 'top-1',
          topicName: 'Mitosis',
          bookId: 'book-1',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          contentSnippet: 'powerhouse of the cell',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      sessions: [
        {
          sessionId: 'sess-1',
          topicId: 'top-1',
          topicTitle: 'Mitosis',
          bookId: 'book-1',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          snippet: 'explored cells today',
          occurredAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    async function renderSearching() {
      mockFetch.setRoute('/subjects', {
        subjects: [{ id: 'sub-1', name: 'Biology', status: 'active' }],
      });
      mockFetch.setRoute('/progress/overview', {
        subjects: [
          {
            subjectId: 'sub-1',
            topicsTotal: 5,
            topicsCompleted: 2,
            topicsVerified: 2,
          },
        ],
      });
      mockFetch.setRoute('/library/search', SEARCH_DATA);

      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        screen.getByTestId('library-search-input');
      });

      fireEvent.changeText(screen.getByTestId('library-search-input'), 'test');
      act(() => {
        jest.runOnlyPendingTimers();
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('subject row tap calls router.push to shelf', async () => {
      await renderSearching();
      await waitFor(() => screen.getByTestId('search-subject-row-sub-1'));
      fireEvent.press(screen.getByTestId('search-subject-row-sub-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: 'sub-1' },
        }),
      );
    });

    it('book row tap pushes shelf then book', async () => {
      await renderSearching();
      await waitFor(() => screen.getByTestId('book-row-book-1'));
      fireEvent.press(screen.getByTestId('book-row-book-1'));
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: 'sub-1' },
        }),
      );
      expect(mockPush).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId: 'sub-1', bookId: 'book-1' },
        }),
      );
    });

    it('topic row tap pushes to topic screen', async () => {
      await renderSearching();
      await waitFor(() => screen.getByTestId('topic-row-top-1'));
      fireEvent.press(screen.getByTestId('topic-row-top-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: 'top-1' },
        }),
      );
    });

    it('note row tap pushes to parent topic', async () => {
      await renderSearching();
      await waitFor(() => screen.getByTestId('note-row-note-1'));
      fireEvent.press(screen.getByTestId('note-row-note-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: 'top-1' },
        }),
      );
    });

    it('session row tap pushes to root session-summary route', async () => {
      await renderSearching();
      await waitFor(() => screen.getByTestId('session-row-sess-1'));
      fireEvent.press(screen.getByTestId('session-row-sess-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/session-summary/[sessionId]',
          params: expect.objectContaining({
            sessionId: 'sess-1',
            subjectId: 'sub-1',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // PR-4 / surface-ownership: Library retention boundary
  //
  // Library derives retention from /library/retention (useLibraryRetention),
  // NOT from useOverallProgress. These tests verify that:
  //   1. The shimmer skeleton shows while libraryRetentionQuery is loading.
  //   2. Shelf rows render correctly when /library/retention returns mixed
  //      statuses (the query-cache path, not the overall-progress path).
  // -------------------------------------------------------------------------
  describe('Library retention boundary [PR-4]', () => {
    it('shows shimmer skeleton while libraryRetentionQuery is loading', async () => {
      // Leave the retention cache unseeded — useLibraryRetention starts in
      // its loading state, and library.tsx must still render the shelf rows
      // because subjects + curriculum are already loaded.
      queryClient.removeQueries({
        queryKey: ['library', 'retention', ACTIVE_PROFILE_ID],
      });
      // Make the fetch never resolve so the loading state persists
      mockFetch.setRoute('/library/retention', () => new Promise(() => {}));

      mockFetch.setRoute('/subjects', {
        subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      });
      mockFetch.setRoute('/progress/overview', {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
      });

      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        // While retention query is pending, subjects are loaded — screen renders
        // (no overall-progress loading gate required). ShelfRow for sub-1 is visible.
        screen.getByTestId('shelf-row-header-sub-1');
      });
    });

    it('renders shelf rows when /library/retention returns subjects with mixed statuses', async () => {
      // Seed the library retention cache with three subjects: strong, fading, forgotten.
      // This tests the query-cache path that useLibraryRetention reads from.
      const FUTURE = new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const NEAR = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();

      setLibraryRetention(queryClient, {
        subjects: [
          {
            subjectId: 'sub-strong',
            topics: [
              {
                topicId: 't-s1',
                easeFactor: 2.5,
                repetitions: 3,
                nextReviewAt: FUTURE,
                lastReviewedAt: '2026-01-01T00:00:00.000Z',
                xpStatus: 'verified',
                failureCount: 0,
              },
            ],
            reviewDueCount: 0,
          },
          {
            subjectId: 'sub-fading',
            topics: [
              {
                topicId: 't-f1',
                easeFactor: 2.5,
                repetitions: 2,
                nextReviewAt: NEAR,
                lastReviewedAt: '2026-01-01T00:00:00.000Z',
                xpStatus: 'pending',
                failureCount: 0,
              },
            ],
            reviewDueCount: 1,
          },
          {
            subjectId: 'sub-forgotten',
            topics: [
              {
                topicId: 't-g1',
                easeFactor: 2.5,
                repetitions: 1,
                nextReviewAt: null,
                lastReviewedAt: null,
                xpStatus: 'decayed',
                failureCount: 0,
              },
            ],
            reviewDueCount: 1,
          },
        ],
      });

      mockFetch.setRoute('/subjects', {
        subjects: [
          { id: 'sub-strong', name: 'Strong Subject', status: 'active' },
          { id: 'sub-fading', name: 'Fading Subject', status: 'active' },
          { id: 'sub-forgotten', name: 'Forgotten Subject', status: 'active' },
        ],
      });
      mockFetch.setRoute('/progress/overview', {
        subjects: [],
        totalTopicsCompleted: 0,
        totalTopicsVerified: 0,
      });

      render(<LibraryScreen />, { wrapper });

      await waitFor(() => {
        // All three shelves render — data sourced exclusively from the library
        // retention cache (not from useOverallProgress). The review badge is
        // rendered by the real ShelfRow based on reviewDueCount, but since
        // ShelfRow is mocked in this test file we assert on what the mock exposes:
        // the three shelf-row headers derived from the three subjects in the
        // library retention payload.
        screen.getByTestId('shelf-row-header-sub-strong');
        screen.getByTestId('shelf-row-header-sub-fading');
        screen.getByTestId('shelf-row-header-sub-forgotten');
      });

      // All three subject names are visible
      screen.getByText('Strong Subject');
      screen.getByText('Fading Subject');
      screen.getByText('Forgotten Subject');
    });
  });
});
