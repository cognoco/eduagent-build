import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoutedMockFetch } from '../../../../test-utils/mock-api-routes';
import ShelfScreen from './index';

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch is assigned inside the jest.mock factory
// so it is available before test code runs (bypasses hoisting issue).
// ---------------------------------------------------------------------------

let mockFetch: RoutedMockFetch;

jest.mock('../../../../lib/api-client', () => {
  const { createRoutedMockFetch, mockApiClientFactory } = require('../../../../test-utils/mock-api-routes');
  mockFetch = createRoutedMockFetch();
  return mockApiClientFactory(mockFetch);
});

jest.mock('../../../../lib/profile', () => ({
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

jest.mock('../../../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#00bfa5',
    textSecondary: '#888',
    textInverse: '#fff',
  }),
}));

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
// Default API route responses
// ---------------------------------------------------------------------------

const DEFAULT_BOOKS = [
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
];

const DEFAULT_SUBJECTS = [{ id: 'sub-1', name: 'Mathematics' }];

function resetRoutes() {
  // Most-specific first to avoid prefix collision:
  // '/book-suggestions' before '/books', '/subjects/sub-1/books' before '/subjects'
  mockFetch.setRoute('/book-suggestions', []);
  mockFetch.setRoute('/subjects/sub-1/books', { books: DEFAULT_BOOKS });
  mockFetch.setRoute('/subjects', { subjects: DEFAULT_SUBJECTS });
  mockFetch.setRoute('/filing', {
    shelfId: 'sub-1',
    bookId: 'book-new',
    shelfName: 'Mathematics',
    bookName: 'Number Theory',
    chapter: 'Intro',
    topicId: 'topic-1',
    topicTitle: 'Numbers',
    isNew: { shelf: false, book: true, chapter: true },
  });
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShelfScreen', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: 'sub-1' });
    resetRoutes();
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  // -----------------------------------------------------------------------
  // Missing param guard
  // -----------------------------------------------------------------------
  it('shows missing-param guidance when subjectId is absent', () => {
    mockSearchParams = () => ({ subjectId: '' });

    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });
    getByTestId('shelf-missing-param');
    expect(
      getByText('Missing subject. Please go back and try again.')
    ).toBeTruthy();
  });

  it('missing-param back button returns to library', () => {
    mockSearchParams = () => ({ subjectId: '' });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });
    fireEvent.press(getByTestId('shelf-missing-param-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  it('renders loading indicator when books are loading', async () => {
    // Delay the books response so the loading state is visible initially
    let resolveBooksResponse!: (r: Response) => void;
    const booksPromise = new Promise<Response>((resolve) => {
      resolveBooksResponse = resolve;
    });
    mockFetch.setRoute('/subjects/sub-1/books', () => booksPromise);

    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });
    getByTestId('shelf-loading');
    getByText('Loading this shelf...');

    // Resolve to prevent test teardown warnings
    resolveBooksResponse(
      new Response(JSON.stringify({ books: DEFAULT_BOOKS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('loading state has a back button that navigates away', async () => {
    let resolveBooksResponse!: (r: Response) => void;
    const booksPromise = new Promise<Response>((resolve) => {
      resolveBooksResponse = resolve;
    });
    mockFetch.setRoute('/subjects/sub-1/books', () => booksPromise);

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });
    fireEvent.press(getByTestId('shelf-loading-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');

    resolveBooksResponse(
      new Response(JSON.stringify({ books: DEFAULT_BOOKS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  // -----------------------------------------------------------------------
  // BUG-82: Error state — retry and back buttons [BUG-82]
  // -----------------------------------------------------------------------
  it('shows error state with retry and back buttons when booksQuery fails [BUG-82]', async () => {
    mockFetch.setRoute('/subjects/sub-1/books', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: 'Failed to load books' }),
          { status: 500 }
        )
      )
    );

    const { getByTestId } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('shelf-error');
    });
    getByTestId('recovery-retry');
    getByTestId('recovery-go-home');
  });

  it('retry button calls refetch on booksQuery when booksQuery fails [BUG-82]', async () => {
    let callCount = 0;
    mockFetch.setRoute('/subjects/sub-1/books', () => {
      callCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({ message: 'Network error' }),
          { status: 500 }
        )
      );
    });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-error');
    });

    const callsBefore = callCount;
    fireEvent.press(getByTestId('recovery-retry'));

    // Retry triggers re-fetch — callCount must increase
    await waitFor(() => {
      expect(callCount).toBeGreaterThan(callsBefore);
    });
  });

  it('go-home button on error screen returns to home [BUG-82]', async () => {
    mockFetch.setRoute('/subjects/sub-1/books', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'oops' }), { status: 500 })
      )
    );

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-error');
    });
    fireEvent.press(getByTestId('recovery-go-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('shows error state with retry and back buttons when subjectsQuery fails [BUG-82]', async () => {
    mockFetch.setRoute('/subjects', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: 'Subjects unavailable' }),
          { status: 500 }
        )
      )
    );

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-error');
    });
    getByTestId('recovery-retry');
    getByTestId('recovery-go-home');
  });

  it('retry button refetches both queries when subjectsQuery fails [BUG-82]', async () => {
    let callCount = 0;
    mockFetch.setRoute('/subjects', () => {
      callCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({ message: 'Subjects unavailable' }),
          { status: 500 }
        )
      );
    });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-error');
    });

    const callsBefore = callCount;
    fireEvent.press(getByTestId('recovery-retry'));

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(callsBefore);
    });
  });

  // -----------------------------------------------------------------------
  // Main view renders
  // -----------------------------------------------------------------------
  it('renders main view with book list when data is loaded', async () => {
    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('shelf-screen');
    });
    getByText('Mathematics');
    getByText('Algebra Basics');
    getByText('Geometry');
  });

  it('back button on main view returns to library', async () => {
    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-screen');
    });
    fireEvent.press(getByTestId('shelf-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('back button replaces library without relying on back history', async () => {
    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-screen');
    });
    fireEvent.press(getByTestId('shelf-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('pressing a book card navigates to the book screen', async () => {
    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('book-card-book-1');
    });
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
  it('shows empty state when no books exist', async () => {
    mockFetch.setRoute('/subjects/sub-1/books', { books: [] });

    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('shelf-empty');
    });
    getByText('No books on this shelf yet.');
  });

  it('empty state back button returns to library', async () => {
    mockFetch.setRoute('/subjects/sub-1/books', { books: [] });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-empty-back');
    });
    fireEvent.press(getByTestId('shelf-empty-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('shows pick-a-suggestion prompt instead of "Check back soon" when suggestions exist [BUG-868]', async () => {
    // Regression: with zero books but visible "Study next" suggestion cards,
    // the empty state used to say "Your curriculum is still being built.
    // Check back soon." — contradicting the cards the user can already tap.
    mockFetch.setRoute('/subjects/sub-1/books', { books: [] });
    mockFetch.setRoute('/book-suggestions', [
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
    ]);

    const { getByTestId, queryByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('shelf-empty-pick-suggestion');
    });
    getByText('Pick a book to start');
    // The conflicting "Check back soon" copy must not render.
    expect(queryByTestId('shelf-empty')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Single-book auto-skip
  // -----------------------------------------------------------------------
  it('renders normally when there is only one book (no auto-skip)', async () => {
    mockFetch.setRoute('/subjects/sub-1/books', {
      books: [
        {
          id: 'book-1',
          title: 'Algebra Basics',
          emoji: '📐',
          topicsGenerated: true,
        },
      ],
    });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-screen');
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Suggestion cards
  // -----------------------------------------------------------------------
  it('shows book suggestion cards when suggestions exist', async () => {
    mockFetch.setRoute('/book-suggestions', [
      { id: 'sug-1', title: 'Number Theory' },
      { id: 'sug-2', title: 'Calculus Intro' },
    ]);

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-suggestion-sug-1');
    });
    getByTestId('shelf-suggestion-sug-2');
  });

  it('picking a book suggestion calls filing and navigates to new book', async () => {
    mockFetch.setRoute('/book-suggestions', [
      { id: 'sug-1', title: 'Number Theory', emoji: '🔢' },
    ]);
    mockFetch.setRoute('/filing', {
      shelfId: 'sub-1',
      bookId: 'book-new',
      shelfName: 'Mathematics',
      bookName: 'Number Theory',
      chapter: 'Intro',
      topicId: 'topic-1',
      topicTitle: 'Numbers',
      isNew: { shelf: false, book: true, chapter: true },
    });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-suggestion-sug-1');
    });
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
      mockFetch.setRoute('/book-suggestions', [
        { id: 'sug-1', title: 'Number Theory', emoji: '🔢' },
      ]);

      // Delay the filing response so we can press Skip while it's in flight
      let resolveFilingResponse!: (r: Response) => void;
      const filingPromise = new Promise<Response>((resolve) => {
        resolveFilingResponse = resolve;
      });
      mockFetch.setRoute('/filing', () => filingPromise);

      const { getByTestId, queryByTestId, rerender } = render(<ShelfScreen />, {
        wrapper: TestWrapper,
      });

      // Wait for suggestions to appear (books + subjects loaded)
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      await waitFor(() => {
        getByTestId('shelf-suggestion-sug-1');
      });

      fireEvent.press(getByTestId('shelf-suggestion-sug-1'));

      // Re-render to pick up isPending state
      rerender(<ShelfScreen />);

      await waitFor(() => {
        getByTestId('shelf-filing-overlay');
      });

      // Advance past the 15s skip-button delay
      await act(async () => {
        jest.advanceTimersByTime(15_500);
      });
      getByTestId('shelf-filing-skip');

      // User taps Skip — must replace route AND mark filing as skipped.
      fireEvent.press(getByTestId('shelf-filing-skip'));
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: 'sub-1' },
        })
      );

      // Now resolve the pending filing — this is the core of the bug.
      resolveFilingResponse(
        new Response(
          JSON.stringify({
            shelfId: 'sub-1',
            bookId: 'book-new',
            shelfName: 'Mathematics',
            bookName: 'Number Theory',
            chapter: 'Intro',
            topicId: 'topic-1',
            topicTitle: 'Numbers',
            isNew: { shelf: false, book: true, chapter: true },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
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
    mockFetch.setRoute('/book-suggestions', [
      { id: 'sug-1', title: 'Number Theory', emoji: '🔢' },
    ]);
    mockFetch.setRoute('/filing', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: 'Filing failed' }),
          { status: 500 }
        )
      )
    );

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-suggestion-sug-1');
    });
    fireEvent.press(getByTestId('shelf-suggestion-sug-1'));

    await waitFor(() => {
      getByTestId('shelf-filing-error-overlay');
      getByTestId('shelf-filing-error-retry');
      getByTestId('shelf-filing-error-back');
    });
  });
});
