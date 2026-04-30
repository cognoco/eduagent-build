import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ShelfScreen from './index';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../../components/common', () => ({
  BookPageFlipAnimation: () => null,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams(),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
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
jest.mock('../../../../lib/format-api-error', () => {
  const actual = jest.requireActual(
    '../../../../lib/format-api-error'
  ) as Record<string, unknown>;
  return {
    ...actual,
    formatApiError: (err: unknown) =>
      err instanceof Error ? err.message : 'Unknown error',
    classifyApiError: (err: unknown) => ({
      message: err instanceof Error ? err.message : 'Unknown error',
      category: 'unknown' as const,
      recovery: 'retry' as const,
    }),
  };
});

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

  it('missing-param back button returns to library', () => {
    mockSearchParams = () => ({ subjectId: '' });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-missing-param-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
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
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
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
    expect(getByTestId('recovery-retry')).toBeTruthy();
    expect(getByTestId('recovery-go-home')).toBeTruthy();
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
    fireEvent.press(getByTestId('recovery-retry'));
    expect(mockBooksRefetch).toHaveBeenCalledTimes(1);
  });

  it('go-home button on error screen returns to home [BUG-82]', () => {
    mockUseBooks.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('oops'),
      refetch: mockBooksRefetch,
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('recovery-go-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
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
    expect(getByTestId('recovery-retry')).toBeTruthy();
    expect(getByTestId('recovery-go-home')).toBeTruthy();
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
    fireEvent.press(getByTestId('recovery-retry'));
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

  it('back button on main view returns to library', () => {
    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('back button replaces library without relying on back history', () => {
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

  it('empty state back button returns to library', () => {
    mockUseBooks.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });

    const { getByTestId } = render(<ShelfScreen />);
    fireEvent.press(getByTestId('shelf-empty-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('shows pick-a-suggestion prompt instead of "Check back soon" when suggestions exist [BUG-868]', () => {
    // Regression: with zero books but visible "Study next" suggestion cards,
    // the empty state used to say "Your curriculum is still being built.
    // Check back soon." — contradicting the cards the user can already tap.
    mockUseBooks.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBooksRefetch,
    });
    mockUseBookSuggestions.mockReturnValue({
      data: [
        {
          id: 'sugg-1',
          title: 'Geometry Foundations',
          emoji: '📐',
          description: 'Triangles, lines, angles.',
        },
        {
          id: 'sugg-2',
          title: 'Calculus: The Basics',
          emoji: '∫',
          description: 'Limits and derivatives.',
        },
      ],
    });

    const { getByTestId, queryByTestId, getByText } = render(<ShelfScreen />);
    expect(getByTestId('shelf-empty-pick-suggestion')).toBeTruthy();
    expect(getByText('Pick a book to start')).toBeTruthy();
    // The conflicting "Check back soon" copy must not render.
    expect(queryByTestId('shelf-empty')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Single-book auto-skip
  // -----------------------------------------------------------------------
  it('renders normally when there is only one book (no auto-skip)', () => {
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

    const { getByTestId } = render(<ShelfScreen />);
    expect(getByTestId('shelf-screen')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
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

  // Auto-skip was removed — single-book shelves render normally now.

  // [BUG-692] When the user taps Skip while filing.mutateAsync is in flight,
  // the resolved onSuccess push must NOT navigate them to the book — they
  // already replaced the route to stay on the shelf. Without the
  // filingSkipped guard, the late onSuccess would yank them back into the
  // book they just chose to skip. Test mirrors the existing pick-book guard.
  it('[BUG-692] Skip during filing prevents stale onSuccess navigation', async () => {
    jest.useFakeTimers();
    try {
      mockUseBookSuggestions.mockReturnValue({
        data: [{ id: 'sug-1', title: 'Number Theory', emoji: '🔢' }],
      });

      // Start with filing not pending so suggestion card renders.
      let resolveFiling: (value: {
        shelfId: string;
        bookId: string;
      }) => void = () => undefined;
      const filingPromise = new Promise<{ shelfId: string; bookId: string }>(
        (resolve) => {
          resolveFiling = resolve;
        }
      );
      mockFilingMutateAsync.mockReturnValueOnce(filingPromise);

      // After tap, the consumer flips isPending=true. We toggle the mock so
      // subsequent renders see isPending=true → overlay + Skip button.
      let pending = false;
      mockUseFiling.mockImplementation(() => ({
        mutateAsync: mockFilingMutateAsync,
        isPending: pending,
      }));

      const { getByTestId, queryByTestId, rerender } = render(<ShelfScreen />);
      fireEvent.press(getByTestId('shelf-suggestion-sug-1'));

      // Flip pending=true and re-render so the overlay + skip-after-15s timer
      // mount.
      pending = true;
      rerender(<ShelfScreen />);
      expect(getByTestId('shelf-filing-overlay')).toBeTruthy();

      // Advance past the 15s skip-button delay (act so React flushes state).
      await act(async () => {
        jest.advanceTimersByTime(15_500);
      });
      expect(getByTestId('shelf-filing-skip')).toBeTruthy();

      // User taps Skip — must replace route AND mark filing as skipped.
      fireEvent.press(getByTestId('shelf-filing-skip'));
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: 'sub-1' },
        })
      );

      // Now resolve the pending filing — this is the core of the bug.
      resolveFiling({ shelfId: 'sub-1', bookId: 'book-new' });
      await waitFor(() => {
        expect(mockFilingMutateAsync).toHaveBeenCalled();
      });
      // Flush microtasks so the awaited mutateAsync resumes.
      await Promise.resolve();
      await Promise.resolve();

      // The break: push to the book route must NOT have fired even though
      // the mutation succeeded — filingSkipped.current was true.
      const bookPushed = mockPush.mock.calls.some((call) => {
        const arg = call[0] as { pathname?: string } | undefined;
        return arg?.pathname === '/(app)/shelf/[subjectId]/book/[bookId]';
      });
      expect(bookPushed).toBe(false);
      // Sanity: error overlay also did not appear.
      expect(queryByTestId('shelf-filing-error-overlay')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
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
