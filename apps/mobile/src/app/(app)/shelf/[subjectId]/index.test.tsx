import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ShelfScreen from './index';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams(),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

// Default search params — overridden per test via mockSearchParams
let mockSearchParams = () => ({ subjectId: 'sub-1' });

// --- useBooks ---
const mockBooksRefetch = jest.fn();

const mockUseBooks = jest.fn((): any => ({
  data: [
    {
      id: 'book-1',
      title: 'Algebra Basics',
      emoji: '📐',
      topicsGenerated: true,
    },
    {
      id: 'book-2',
      title: 'Geometry',
      emoji: '📏',
      topicsGenerated: false,
    },
  ],
  isLoading: false,
  isError: false,
  error: null,
  refetch: mockBooksRefetch,
}));

jest.mock('../../../../hooks/use-books', () => ({
  useBooks: () => mockUseBooks(),
}));

// --- useSubjects ---
const mockSubjectsRefetch = jest.fn();

const mockUseSubjects = jest.fn((): any => ({
  data: [{ id: 'sub-1', name: 'Mathematics' }],
  isLoading: false,
  isError: false,
  error: null,
  refetch: mockSubjectsRefetch,
}));

jest.mock('../../../../hooks/use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
}));

// --- useBookSuggestions ---

const mockUseBookSuggestions = jest.fn((): any => ({
  data: [],
}));

jest.mock('../../../../hooks/use-book-suggestions', () => ({
  useBookSuggestions: () => mockUseBookSuggestions(),
}));

// --- useFiling ---
const mockFilingMutateAsync = jest.fn();

const mockUseFiling = jest.fn((): any => ({
  mutateAsync: mockFilingMutateAsync,
  isPending: false,
}));

jest.mock('../../../../hooks/use-filing', () => ({
  useFiling: () => mockUseFiling(),
}));

// --- useThemeColors ---
jest.mock('../../../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#00bfa5',
    textSecondary: '#888',
    textInverse: '#fff',
  }),
}));

// --- formatApiError ---
jest.mock('../../../../lib/format-api-error', () => ({
  formatApiError: (err: unknown) =>
    err instanceof Error ? err.message : 'Unknown error',
  classifyApiError: (err: unknown) => ({
    message: err instanceof Error ? err.message : 'Unknown error',
    category: 'unknown' as const,
    recovery: 'retry' as const,
  }),
}));

// --- Library components ---
jest.mock('../../../../components/library/BookCard', () => ({
  BookCard: ({
    book,
    onPress,
  }: {
    book: { id: string; title: string };
    onPress: () => void;
  }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return (
      <Pressable onPress={onPress} testID={`book-card-${book.id}`}>
        <Text>{book.title}</Text>
      </Pressable>
    );
  },
}));

jest.mock('../../../../components/library/SuggestionCard', () => ({
  SuggestionCard: ({
    title,
    onPress,
    testID,
  }: {
    title: string;
    onPress: () => void;
    testID?: string;
  }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return (
      <Pressable onPress={onPress} testID={testID}>
        <Text>{title}</Text>
      </Pressable>
    );
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShelfScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: 'sub-1' });
    mockCanGoBack.mockReturnValue(true);

    mockUseBooks.mockImplementation(() => ({
      data: [
        {
          id: 'book-1',
          title: 'Algebra Basics',
          emoji: '📐',
          topicsGenerated: true,
        },
        {
          id: 'book-2',
          title: 'Geometry',
          emoji: '📏',
          topicsGenerated: false,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    }));

    mockUseSubjects.mockImplementation(() => ({
      data: [{ id: 'sub-1', name: 'Mathematics' }],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockSubjectsRefetch,
    }));

    mockUseBookSuggestions.mockImplementation(() => ({ data: [] }));

    mockUseFiling.mockImplementation(() => ({
      mutateAsync: mockFilingMutateAsync,
      isPending: false,
    }));
  });

  // -----------------------------------------------------------------------
  // Missing param guard
  // -----------------------------------------------------------------------
  it('shows missing-param guidance when subjectId is absent', () => {
    mockSearchParams = () => ({ subjectId: '' });

    const { getByTestId, getByText } = render(<ShelfScreen />);
    expect(getByTestId('shelf-missing-param')).toBeTruthy();
    expect(
      getByText('Missing subject. Please go back and try again.')
    ).toBeTruthy();
  });

  it('missing-param back button calls router.back()', () => {
    mockSearchParams = () => ({ subjectId: '' });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-missing-param-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  it('renders loading indicator when books are loading', () => {
    mockUseBooks.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    const { getByTestId, getByText } = render(<ShelfScreen />);
    expect(getByTestId('shelf-loading')).toBeTruthy();
    expect(getByText('Loading this shelf...')).toBeTruthy();
  });

  it('loading state has a back button that navigates away', () => {
    mockUseBooks.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-loading-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // BUG-82: Error state — retry and back buttons [BUG-82]
  // -----------------------------------------------------------------------
  it('shows error state with retry and back buttons when booksQuery fails [BUG-82]', () => {
    mockUseBooks.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to load books'),
      refetch: mockBooksRefetch,
    });

    const { getByTestId, getByText } = render(<ShelfScreen />);
    expect(getByTestId('shelf-error')).toBeTruthy();
    expect(getByText('Failed to load books')).toBeTruthy();
    expect(getByTestId('shelf-retry-button')).toBeTruthy();
    expect(getByTestId('shelf-back-button')).toBeTruthy();
  });

  it('retry button calls refetch on booksQuery when booksQuery fails [BUG-82]', () => {
    mockUseBooks.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: mockBooksRefetch,
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-retry-button'));
    expect(mockBooksRefetch).toHaveBeenCalledTimes(1);
  });

  it('back button on error screen calls router.back() [BUG-82]', () => {
    mockUseBooks.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('oops'),
      refetch: mockBooksRefetch,
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows error state with retry and back buttons when subjectsQuery fails [BUG-82]', () => {
    mockUseSubjects.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Subjects unavailable'),
      refetch: mockSubjectsRefetch,
    });

    const { getByTestId, getByText } = render(<ShelfScreen />);
    expect(getByTestId('shelf-error')).toBeTruthy();
    expect(getByText('Subjects unavailable')).toBeTruthy();
    expect(getByTestId('shelf-retry-button')).toBeTruthy();
    expect(getByTestId('shelf-back-button')).toBeTruthy();
  });

  it('retry button refetches both queries when subjectsQuery fails [BUG-82]', () => {
    mockUseSubjects.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Subjects unavailable'),
      refetch: mockSubjectsRefetch,
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-retry-button'));
    expect(mockSubjectsRefetch).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Main view renders
  // -----------------------------------------------------------------------
  it('renders main view with book list when data is loaded', () => {
    const { getByTestId, getByText } = render(<ShelfScreen />);
    expect(getByTestId('shelf-screen')).toBeTruthy();
    expect(getByText('Mathematics')).toBeTruthy();
    expect(getByText('Algebra Basics')).toBeTruthy();
    expect(getByText('Geometry')).toBeTruthy();
  });

  it('back button on main view calls router.back()', () => {
    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('back button replaces library when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false);

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('pressing a book card navigates to the book screen', () => {
    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('book-card-book-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: expect.objectContaining({
          subjectId: 'sub-1',
          bookId: 'book-1',
        }),
      })
    );
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  it('shows empty state when no books exist', () => {
    mockUseBooks.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    const { getByTestId, getByText } = render(<ShelfScreen />);
    expect(getByTestId('shelf-empty')).toBeTruthy();
    expect(getByText('No books on this shelf yet.')).toBeTruthy();
  });

  it('empty state back button calls router.back()', () => {
    mockUseBooks.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-empty-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Single-book auto-skip
  // -----------------------------------------------------------------------
  it('auto-redirects to book screen when there is only one book', async () => {
    mockUseBooks.mockReturnValue({
      data: [
        {
          id: 'book-1',
          title: 'Algebra Basics',
          emoji: '📐',
          topicsGenerated: true,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    render(<ShelfScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: expect.objectContaining({
            subjectId: 'sub-1',
            bookId: 'book-1',
          }),
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Suggestion cards
  // -----------------------------------------------------------------------
  it('shows book suggestion cards when suggestions exist', () => {
    mockUseBookSuggestions.mockReturnValue({
      data: [
        { id: 'sug-1', title: 'Number Theory' },
        { id: 'sug-2', title: 'Calculus Intro' },
      ],
    });

    const { getByTestId } = render(<ShelfScreen />);
    expect(getByTestId('shelf-suggestion-sug-1')).toBeTruthy();
    expect(getByTestId('shelf-suggestion-sug-2')).toBeTruthy();
  });

  it('picking a book suggestion calls filing and navigates to new book', async () => {
    mockUseBookSuggestions.mockReturnValue({
      data: [{ id: 'sug-1', title: 'Number Theory', emoji: '🔢' }],
    });

    mockFilingMutateAsync.mockResolvedValue({
      shelfId: 'sub-1',
      bookId: 'book-new',
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-suggestion-sug-1'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: expect.objectContaining({
            subjectId: 'sub-1',
            bookId: 'book-new',
            autoStart: 'true',
          }),
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // BUG-FIX: auto-skip must reset when subjectId changes
  // -----------------------------------------------------------------------
  it('auto-skip fires again when subjectId changes (component reuse)', async () => {
    // First render: sub-1 with 1 book → auto-skip fires
    mockSearchParams = () => ({ subjectId: 'sub-1' });
    mockUseBooks.mockReturnValue({
      data: [
        {
          id: 'book-A',
          title: 'Book A',
          emoji: '📗',
          topicsGenerated: true,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    const { rerender } = render(<ShelfScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            subjectId: 'sub-1',
            bookId: 'book-A',
          }),
        })
      );
    });

    // Simulate Expo Router reusing the component with a different subjectId
    mockReplace.mockClear();
    mockSearchParams = () => ({ subjectId: 'sub-2' });
    mockUseBooks.mockReturnValue({
      data: [
        {
          id: 'book-B',
          title: 'Book B',
          emoji: '📘',
          topicsGenerated: true,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    rerender(<ShelfScreen />);

    // Auto-skip must fire again for the new subject's book
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            subjectId: 'sub-2',
            bookId: 'book-B',
          }),
        })
      );
    });
  });

  it('shows ErrorFallback overlay when picking a book suggestion fails', async () => {
    mockUseBookSuggestions.mockReturnValue({
      data: [{ id: 'sug-1', title: 'Number Theory', emoji: '🔢' }],
    });

    mockFilingMutateAsync.mockRejectedValue(new Error('Filing failed'));

    const { getByTestId, getByText } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-suggestion-sug-1'));

    await waitFor(() => {
      expect(getByTestId('shelf-filing-error-overlay')).toBeTruthy();
      expect(getByText('Filing failed')).toBeTruthy();
      expect(getByTestId('shelf-filing-error-retry')).toBeTruthy();
      expect(getByTestId('shelf-filing-error-back')).toBeTruthy();
    });
  });
});
