import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Use the shared mock-i18n util so assertions reference the rendered English
// copy from en.json (what users actually see), not bare keys. A bare-key mock
// would only prove t() was called — not that the translation pipeline is
// wired correctly or that {{interpolation}} tokens resolve. See
// apps/mobile/src/test-utils/mock-i18n.ts for the lookup behaviour.
jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock
);

const mockPush = jest.fn();
const mockUseSubjects = jest.fn();
const mockUseOverallProgress = jest.fn();
const mockUseAllBooks = jest.fn();
const mockUseNoteTopicIds = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    // Execute focus effect synchronously in tests so expansion state is set
    const React = require('react');
    React.useEffect(cb, []);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
  useUpdateSubject: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useOverallProgress: () => mockUseOverallProgress(),
}));

jest.mock('../../hooks/use-all-books', () => ({
  useAllBooks: () => mockUseAllBooks(),
}));

jest.mock('../../hooks/use-notes', () => ({
  useNoteTopicIds: () => mockUseNoteTopicIds(),
}));

jest.mock('../../components/progress', () => ({
  RetentionSignal: ({ status }: { status: string }) => {
    const { Text } = require('react-native');
    return <Text>{status}</Text>;
  },
}));

jest.mock('../../components/common', () => ({
  BookPageFlipAnimation: () => null,
  BrandCelebration: () => null,
  ErrorFallback: ({
    testID,
    primaryAction,
    secondaryAction,
  }: {
    testID?: string;
    primaryAction?: { label: string; onPress: () => void; testID?: string };
    secondaryAction?: { label: string; onPress: () => void; testID?: string };
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View testID={testID}>
        {primaryAction && (
          <Pressable
            testID={primaryAction.testID}
            onPress={primaryAction.onPress}
          >
            <Text>{primaryAction.label}</Text>
          </Pressable>
        )}
        {secondaryAction && (
          <Pressable
            testID={secondaryAction.testID}
            onPress={secondaryAction.onPress}
          >
            <Text>{secondaryAction.label}</Text>
          </Pressable>
        )}
      </View>
    );
  },
}));

jest.mock('../../lib/navigation', () => ({
  goBackOrReplace: jest.fn(),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#2563eb',
    border: '#e5e7eb',
    primary: '#2563eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    surfaceElevated: '#f9fafb',
    warning: '#f59e0b',
  }),
}));

jest.mock('../../lib/api-client', () => ({
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
  useLibrarySearch: () => ({
    data: null,
    isLoading: false,
    isError: false,
  }),
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
    expanded,
    books,
    onToggle,
    onBookPress,
  }: {
    subjectId: string;
    name: string;
    expanded: boolean;
    books: Array<{ bookId: string; title: string }>;
    onToggle: (id: string) => void;
    onBookPress: (subjectId: string, bookId: string) => void;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View>
        <Pressable
          testID={`shelf-row-header-${subjectId}`}
          onPress={() => onToggle(subjectId)}
          accessibilityRole="button"
        >
          <Text>{name}</Text>
        </Pressable>
        {expanded &&
          books.map((book) => (
            <Pressable
              key={book.bookId}
              testID={`book-row-${book.bookId}`}
              onPress={() => onBookPress(subjectId, book.bookId)}
            >
              <Text>{book.title}</Text>
            </Pressable>
          ))}
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
  payload: AggregateLibRetention | undefined
) {
  queryClient.setQueryData(
    ['library', 'retention', ACTIVE_PROFILE_ID],
    payload
  );
}

const LibraryScreen = require('./library').default;

describe('LibraryScreen', () => {
  let testQueryClient: QueryClient;
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
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
    mockUseNoteTopicIds.mockReturnValue({
      data: { topicIds: [] },
      isLoading: false,
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
      render(<LibraryScreen />, { wrapper: TestWrapper })
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
      render(<LibraryScreen />, { wrapper: TestWrapper })
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
      render(<LibraryScreen />, { wrapper: TestWrapper })
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
      render(<LibraryScreen />, { wrapper: TestWrapper })
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

  it('has no top-level tabs — library uses expandable shelf layout', () => {
    // Library v3 redesign replaced Shelves/Books/Topics tabs with a single
    // expandable shelf list. There are no tab controls at the library level.
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
    // Instead, the shelf list is the root navigation
    screen.getByTestId('shelves-list');
  });

  it('navigates to book screen when a book row inside an expanded shelf is pressed', () => {
    // Library v3: books are accessed by expanding a shelf row, not via a
    // separate Books tab. Single deep push: shelf/[subjectId]/_layout exports
    // unstable_settings.initialRouteName = 'index', which seeds the stack so
    // router.back() from the book screen returns to the shelf index.
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [] },
      isLoading: false,
    });
    mockUseAllBooks.mockReturnValue({
      books: [
        {
          book: {
            id: 'book-1',
            subjectId: 'sub-1',
            title: 'Algebra',
            description: null,
            emoji: '📐',
            sortOrder: 1,
            topicsGenerated: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          subjectId: 'sub-1',
          subjectName: 'Math',
          topicCount: 5,
          completedCount: 2,
          status: 'IN_PROGRESS',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<LibraryScreen />, { wrapper: TestWrapper });

    // The focus effect expands the first active subject automatically.
    // The ShelfRow mock renders book-row-book-1 when expanded=true.
    fireEvent.press(screen.getByTestId('book-row-book-1'));

    // [CLAUDE.md cross-tab nav] Two-push pattern: parent shelf first,
    // then book child. unstable_settings only seeds one level deep, so
    // explicit ancestor push keeps router.back() landing on the shelf
    // index rather than the Tabs root.
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId: 'sub-1', bookId: 'book-1' },
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
        screen.UNSAFE_queryByProps({ visible: false, animationType: 'slide' })
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
});
