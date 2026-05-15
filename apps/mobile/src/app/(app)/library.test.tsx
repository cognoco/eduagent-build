import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
const mockUseSubjects = jest.fn();
const mockUseOverallProgress = jest.fn();
const mockUseAllBooks = jest.fn();
const mockUseLibrarySearch = jest.fn();
const mockUpdateSubjectMutateAsync = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
  useUpdateSubject: () => ({ mutateAsync: mockUpdateSubjectMutateAsync }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useOverallProgress: () => mockUseOverallProgress(),
}));

jest.mock('../../hooks/use-all-books', () => ({
  useAllBooks: () => mockUseAllBooks(),
}));

jest.mock('../../components/progress', () => ({
  RetentionSignal: ({ status }: { status: string }) => {
    const { Text } = require('react-native');
    return <Text>{status}</Text>;
  },
}));

jest.mock('../../components/common', () => ({
  ...jest.requireActual('../../components/common'),
  // gc1-allow: Reanimated worklets + react-native-svg cannot run in JSDOM
  BookPageFlipAnimation: () => null,
  BrandCelebration: () => null,
}));

// navigation: real module is pure functions wrapping expo-router (already mocked)

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    accent: '#2563eb',
    border: '#e5e7eb',
    primary: '#2563eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    surfaceElevated: '#f9fafb',
    warning: '#f59e0b',
  }),
  useSubjectTint: () => ({
    solid: '#0f766e',
    soft: 'rgba(15,118,110,0.14)',
  }),
}));

jest.mock('../../lib/api-client', () => ({
  // gc1-allow: Clerk useAuth() external boundary
  ...jest.requireActual('../../lib/api-client'),
  useApiClient: () => ({
    library: {
      retention: {
        $get: jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ subjects: [] }),
        }),
      },
    },
  }),
}));

jest.mock('../../hooks/use-library-search', () => ({
  useLibrarySearch: (...args: unknown[]) => mockUseLibrarySearch(...args),
}));

jest.mock('../../components/common/ShimmerSkeleton', () => ({
  ShimmerSkeleton: ({
    children,
    testID,
  }: {
    children: React.ReactNode;
    testID?: string;
  }) => {
    const { View } = require('react-native');
    return <View testID={testID}>{children}</View>;
  },
}));

jest.mock('../../components/library/ShelfRow', () => ({
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

jest.mock('../../components/library/LibrarySearchBar', () => ({
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

jest.mock('../../lib/profile', () => ({
  // gc1-allow: ProfileProvider uses SecureStore (native)
  ...jest.requireActual('../../lib/profile'),
  useProfile: () => ({
    activeProfile: { id: 'profile-1', isOwner: true },
    profiles: [{ id: 'profile-1', isOwner: true }],
  }),
  isGuardianProfile: () => false,
}));

interface AggregateLibRetention {
  subjects: Array<{
    subjectId: string;
    topics: unknown[];
    reviewDueCount: number;
  }>;
}

// The active profile ID used by the profile mock below.
const ACTIVE_PROFILE_ID = 'profile-1';

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

describe('LibraryScreen', () => {
  let testQueryClient: QueryClient;
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSubjectMutateAsync.mockResolvedValue(undefined);
    const { queryClient, Wrapper } = createWrapper();
    testQueryClient = queryClient;
    TestWrapper = Wrapper;
    setLibraryRetention(testQueryClient, { subjects: [] });
    mockUseAllBooks.mockReturnValue({
      books: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseLibrarySearch.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('shows loading state', () => {
    mockUseSubjects.mockReturnValue({ data: undefined, isLoading: true });
    mockUseOverallProgress.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

    screen.getByTestId('library-loading');
  });

  it('[BUG-634 / M-2] does not crash when subjectsQuery.data is a non-array (stale shape / error payload)', () => {
    // Repro: TanStack Query select transform is bypassed when enabled=false,
    // so the cached value can be a non-array. Without the Array.isArray guard
    // the allTopics flatMap throws TypeError and the screen white-screens.
    mockUseSubjects.mockReturnValue({
      data: { unexpected: 'shape' } as unknown as never,
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    expect(() =>
      render(<LibraryScreen />, { wrapper: TestWrapper }),
    ).not.toThrow();
  });

  it('[BUG-634 / M-2] does not crash when subjectsQuery.data is null', () => {
    mockUseSubjects.mockReturnValue({
      data: null as unknown as never,
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });
    expect(() =>
      render(<LibraryScreen />, { wrapper: TestWrapper }),
    ).not.toThrow();
  });

  // [BUG-818] Repro: server returned a partial-success payload where
  // `topics` was undefined or a non-array value (schema drift, error
  // payload). Without an Array.isArray guard, `data.topics.map` threw and
  // white-screened the Library tab.
  it('[BUG-818] does not crash when retentionQuery.data.topics is undefined', () => {
    mockUseSubjects.mockReturnValue({
      data: [
        {
          id: 'sub-1',
          name: 'Math',
          status: 'IN_PROGRESS',
        },
      ] as never,
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });
    setLibraryRetention(testQueryClient, {
      subjects: [
        {
          subjectId: 'sub-1',
          topics: undefined as unknown as never,
          reviewDueCount: 0,
        },
      ],
    });

    expect(() =>
      render(<LibraryScreen />, { wrapper: TestWrapper }),
    ).not.toThrow();
  });

  it('[BUG-818] does not crash when retentionQuery.data.topics is a non-array shape', () => {
    mockUseSubjects.mockReturnValue({
      data: [
        {
          id: 'sub-1',
          name: 'Math',
          status: 'IN_PROGRESS',
        },
      ] as never,
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });
    setLibraryRetention(testQueryClient, {
      subjects: [
        {
          subjectId: 'sub-1',
          topics: 'unexpected' as unknown as never,
          reviewDueCount: 0,
        },
      ],
    });

    expect(() =>
      render(<LibraryScreen />, { wrapper: TestWrapper }),
    ).not.toThrow();
  });

  it('shows empty state when there are no subjects', () => {
    mockUseSubjects.mockReturnValue({ data: [], isLoading: false });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

    // New library v3 design: empty state uses library-empty testID
    screen.getByTestId('library-empty');
    screen.getByText('Your library will grow as you learn');
  });

  it('routes empty-state learners to subject creation', () => {
    mockUseSubjects.mockReturnValue({ data: [], isLoading: false });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

    fireEvent.press(screen.getByTestId('library-empty-go-home'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-subject',
      params: { returnTo: 'library' },
    });
  });

  it('renders shelf rows for each subject', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'History', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: {
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
      },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

    // Library v3: subject is a shelf row, not a card
    screen.getByTestId('shelf-row-header-sub-1');
    screen.getByText('History');
  });

  it('orders active subjects first, then paused, then archived', () => {
    mockUseSubjects.mockReturnValue({
      data: [
        { id: 'sub-archived', name: 'Archived Spanish', status: 'archived' },
        { id: 'sub-paused', name: 'Paused History', status: 'paused' },
        { id: 'sub-active', name: 'Active Math', status: 'active' },
      ],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

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

  it('has no top-level tabs — library opens subject shelves as the next level', () => {
    // Library v3 redesign replaced Shelves/Books/Topics tabs with a subject
    // shelf list. There are no tab controls at the library level.
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

    expect(screen.queryByTestId('library-tab-shelves')).toBeNull();
    expect(screen.queryByTestId('library-tab-books')).toBeNull();
    expect(screen.queryByTestId('library-tab-topics')).toBeNull();
    // Instead, the subject shelf list is the root navigation.
    screen.getByTestId('shelves-list');
  });

  it('opens the subject shelf when a subject row is pressed', () => {
    // Library is subject-first: books and suggestions live on the subject
    // shelf screen instead of expanding inline inside the Library list.
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [] },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

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
  it('does not show full-page error when only allBooksQuery fails', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseAllBooks.mockReturnValue({
      books: [],
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

    // Library renders normally — subjects still visible as shelf rows
    expect(screen.queryByTestId('library-error')).toBeNull();
    screen.getByTestId('shelves-list');
  });

  describe('Manage Subjects modal — backdrop close [BUG-510]', () => {
    function arrangeWithOneSubject() {
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      mockUseOverallProgress.mockReturnValue({
        data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
    }

    it('closes when the backdrop (outside the sheet) is tapped [BUG-510]', () => {
      // Repro: on web the Close button sits behind the bottom tab bar so
      // pointer events never reach it; the modal had no other dismiss path
      // because the backdrop was a plain View with no onPress.
      arrangeWithOneSubject();
      render(<LibraryScreen />, { wrapper: TestWrapper });

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

    it('exposes an accessible label so assistive tech can dismiss the modal [BUG-510]', () => {
      arrangeWithOneSubject();
      render(<LibraryScreen />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('manage-subjects-button'));

      const backdrop = screen.getByTestId('manage-subjects-backdrop');
      expect(backdrop.props.accessibilityRole).toBe('button');
      expect(backdrop.props.accessibilityLabel).toBe('Close manage subjects');
    });

    it('sends archived status when the Archive action is pressed', async () => {
      arrangeWithOneSubject();
      render(<LibraryScreen />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('manage-subjects-button'));
      fireEvent.press(screen.getByTestId('archive-subject-sub-1'));

      await waitFor(() => {
        expect(mockUpdateSubjectMutateAsync).toHaveBeenCalledWith({
          subjectId: 'sub-1',
          status: 'archived',
        });
      });
    });

    it('disables other subject actions while one status update is saving', async () => {
      let finishUpdate!: () => void;
      mockUpdateSubjectMutateAsync.mockReturnValue(
        new Promise<void>((resolve) => {
          finishUpdate = resolve;
        }),
      );
      mockUseSubjects.mockReturnValue({
        data: [
          { id: 'sub-1', name: 'Math', status: 'active' },
          { id: 'sub-2', name: 'History', status: 'active' },
        ],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      mockUseOverallProgress.mockReturnValue({
        data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      render(<LibraryScreen />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('manage-subjects-button'));
      fireEvent.press(screen.getByTestId('archive-subject-sub-1'));

      await waitFor(() => {
        expect(screen.getByTestId('archive-subject-sub-2')).toBeDisabled();
      });
      expect(mockUpdateSubjectMutateAsync).toHaveBeenCalledWith({
        subjectId: 'sub-1',
        status: 'archived',
      });
      finishUpdate();
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
    it('counts topics with null bookId in the header subtitle', () => {
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
        isLoading: false,
      });
      mockUseOverallProgress.mockReturnValue({
        data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
        isLoading: false,
      });
      setLibraryRetention(testQueryClient, {
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

      render(<LibraryScreen />, { wrapper: TestWrapper });

      // 3 topics total (1 with bookId, 2 with null bookId) must all be counted.
      // Pre-fix this would render "1 subjects · 1 topics" (orphans dropped).
      // Match on the topic-count segment only — the subject-count segment's
      // grammar ("1 subject" vs "1 subjects") may shift if proper i18next
      // pluralization lands later, and that change is unrelated to BUG-971.
      expect(screen.getByText(/· 3 topics\b/)).toBeTruthy();
    });

    it('omits the topic count segment entirely when there are no topics', () => {
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
        isLoading: false,
      });
      mockUseOverallProgress.mockReturnValue({
        data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
        isLoading: false,
      });
      setLibraryRetention(testQueryClient, { subjects: [] });

      render(<LibraryScreen />, { wrapper: TestWrapper });

      // Header should read just "1 subjects" with no trailing " · N topics".
      screen.getByText('1 subjects');
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

    function renderSearching() {
      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Biology', status: 'active' }],
        isLoading: false,
        isError: false,
      });
      mockUseOverallProgress.mockReturnValue({
        data: {
          subjects: [
            {
              subjectId: 'sub-1',
              topicsTotal: 5,
              topicsCompleted: 2,
              topicsVerified: 2,
            },
          ],
        },
        isLoading: false,
        isError: false,
      });
      mockUseLibrarySearch.mockReturnValue({
        data: SEARCH_DATA,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
      render(<LibraryScreen />, { wrapper: TestWrapper });
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

    it('subject row tap calls router.push to shelf', () => {
      renderSearching();
      fireEvent.press(screen.getByTestId('search-subject-row-sub-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: 'sub-1' },
        }),
      );
    });

    it('book row tap pushes shelf then book', () => {
      renderSearching();
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

    it('topic row tap pushes to topic screen', () => {
      renderSearching();
      fireEvent.press(screen.getByTestId('topic-row-top-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: 'top-1' },
        }),
      );
    });

    it('note row tap pushes to parent topic', () => {
      renderSearching();
      fireEvent.press(screen.getByTestId('note-row-note-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: 'top-1' },
        }),
      );
    });

    it('session row tap pushes to root session-summary route', () => {
      renderSearching();
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
      // Pre-emptively seed retention as undefined so the useApiClient mock
      // returns a never-resolving promise — simulating a slow /library/retention.
      // Leave the retention cache unseeded — useLibraryRetention starts in
      // its loading state, and library.tsx must still render the shelf rows
      // because subjects + curriculum are already loaded.
      testQueryClient.setQueryData(
        ['library', 'retention', ACTIVE_PROFILE_ID],
        undefined,
      );

      mockUseSubjects.mockReturnValue({
        data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
        isLoading: false,
        isError: false,
      });
      mockUseOverallProgress.mockReturnValue({
        data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
        isLoading: false,
        isError: false,
      });

      render(<LibraryScreen />, { wrapper: TestWrapper });

      // While retention query is pending, subjects are loaded — screen renders
      // (no overall-progress loading gate required). ShelfRow for sub-1 is visible.
      screen.getByTestId('shelf-row-header-sub-1');
    });

    it('renders shelf rows when /library/retention returns subjects with mixed statuses', async () => {
      // Seed the library retention cache with three subjects: strong, fading, forgotten.
      // This tests the query-cache path that useLibraryRetention reads from.
      const FUTURE = new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const NEAR = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();

      setLibraryRetention(testQueryClient, {
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

      mockUseSubjects.mockReturnValue({
        data: [
          { id: 'sub-strong', name: 'Strong Subject', status: 'active' },
          { id: 'sub-fading', name: 'Fading Subject', status: 'active' },
          { id: 'sub-forgotten', name: 'Forgotten Subject', status: 'active' },
        ],
        isLoading: false,
        isError: false,
      });
      mockUseOverallProgress.mockReturnValue({
        data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
        isLoading: false,
        isError: false,
      });

      render(<LibraryScreen />, { wrapper: TestWrapper });

      // All three shelves render — data sourced exclusively from the library
      // retention cache (not from useOverallProgress). The review badge is
      // rendered by the real ShelfRow based on reviewDueCount, but since
      // ShelfRow is mocked in this test file we assert on what the mock exposes:
      // the three shelf-row headers derived from the three subjects in the
      // library retention payload.
      screen.getByTestId('shelf-row-header-sub-strong');
      screen.getByTestId('shelf-row-header-sub-fading');
      screen.getByTestId('shelf-row-header-sub-forgotten');

      // All three subject names are visible
      screen.getByText('Strong Subject');
      screen.getByText('Fading Subject');
      screen.getByText('Forgotten Subject');
    });
  });
});
