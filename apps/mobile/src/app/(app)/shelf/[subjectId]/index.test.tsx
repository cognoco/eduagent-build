import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import type {
  BookSuggestion,
  CurriculumBook,
  Subject,
} from '@eduagent/schemas';
import {
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../../../test-utils/mock-api-routes';
import {
  createScreenWrapper,
  createTestProfile,
} from '../../../../test-utils/screen-render';
import { FEATURE_FLAGS } from '../../../../lib/feature-flags';
import ShelfScreen from './index';

jest.mock(
  'react-i18next',
  () => require('../../../../test-utils/mock-i18n').i18nMock,
);

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch is assigned inside the jest.mock factory
// so it is available before test code runs (bypasses hoisting issue).
// ---------------------------------------------------------------------------

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

// [GC6] lib/profile mock removed — the test now provides a REAL
// ProfileContext.Provider via the shared `createScreenWrapper` harness, so
// `useProfile()` (read by useBooks / useSubjects for the active profile id)
// runs against an actual context value instead of a stub.

// ---------------------------------------------------------------------------
// External / rendering mocks (kept — not API hooks)
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../../components/common' /* gc1-allow: Reanimated worklets + react-native-svg cannot run in JSDOM */,
  () => ({
    BookPageFlipAnimation: ({
      size,
      testID,
    }: {
      size?: number;
      testID?: string;
    }) => {
      const React = require('react');
      const { View } = require('react-native');
      return React.createElement(View, {
        testID,
        style: { width: size, height: size },
      });
    },
  }),
);

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
const PROFILE_ID = '110e8400-e29b-41d4-a716-446655440001';
const ACCOUNT_ID = '110e8400-e29b-41d4-a716-446655440002';
const SUBJECT_ID = '220e8400-e29b-41d4-a716-446655440001';
const BOOK_1_ID = '330e8400-e29b-41d4-a716-446655440001';
const BOOK_2_ID = '330e8400-e29b-41d4-a716-446655440002';
const NEW_BOOK_ID = '330e8400-e29b-41d4-a716-446655440003';
const TOPIC_ID = '440e8400-e29b-41d4-a716-446655440001';
const SUGGESTION_1_ID = '550e8400-e29b-41d4-a716-446655440001';
const SUGGESTION_2_ID = '550e8400-e29b-41d4-a716-446655440002';
const SUGGESTION_3_ID = '550e8400-e29b-41d4-a716-446655440003';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

let mockSearchParams = () => ({ subjectId: SUBJECT_ID });

jest.mock(
  '../../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      accent: '#00bfa5',
      background: '#faf5ee',
      border: '#e8e0d4',
      surface: '#ffffff',
      textSecondary: '#888',
      textInverse: '#fff',
    }),
    useSubjectTint: () => ({
      name: 'teal',
      solid: '#0f766e',
      soft: 'rgba(15,118,110,0.14)',
    }),
  }),
);

jest.mock(
  '../../../../components/library/BookCard' /* gc1-allow: pattern-a conversion; provides testable Pressable substitute that renders book.id as testID */,
  () => ({
    ...jest.requireActual('../../../../components/library/BookCard'),
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
  }),
);

jest.mock(
  '../../../../components/library/SuggestionCard' /* gc1-allow: pattern-a conversion; provides testable Pressable substitute that renders suggestion.title as testID */,
  () => ({
    ...jest.requireActual('../../../../components/library/SuggestionCard'),
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
  }),
);

// ---------------------------------------------------------------------------
// Default API route responses
// ---------------------------------------------------------------------------

const DEFAULT_BOOKS: CurriculumBook[] = [
  {
    id: BOOK_1_ID,
    subjectId: SUBJECT_ID,
    title: 'Algebra Basics',
    description: null,
    emoji: '📐',
    sortOrder: 0,
    topicsGenerated: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
  {
    id: BOOK_2_ID,
    subjectId: SUBJECT_ID,
    title: 'Geometry',
    description: null,
    emoji: '📏',
    sortOrder: 1,
    topicsGenerated: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
];

const DEFAULT_SUBJECTS: Subject[] = [
  {
    id: SUBJECT_ID,
    profileId: PROFILE_ID,
    name: 'Mathematics',
    status: 'active',
    pedagogyMode: 'socratic',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
];

function makeSuggestion(
  id: string,
  title: string,
  emoji: string | null = null,
  description: string | null = null,
): BookSuggestion {
  return {
    id,
    subjectId: SUBJECT_ID,
    title,
    emoji,
    description,
    category: null,
    createdAt: CREATED_AT,
    pickedAt: null,
  };
}

function resetRoutes() {
  // Most-specific first to avoid prefix collision:
  // '/book-suggestions' before '/books', subject books before '/subjects'
  mockFetch.setRoute('/book-suggestions', {
    suggestions: [],
    curriculumBookCount: 2,
  });
  mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, {
    books: DEFAULT_BOOKS,
  });
  mockFetch.setRoute('/subjects', { subjects: DEFAULT_SUBJECTS });
  mockFetch.setRoute('/filing', {
    shelfId: SUBJECT_ID,
    bookId: NEW_BOOK_ID,
    shelfName: 'Mathematics',
    bookName: 'Number Theory',
    chapter: 'Intro',
    topicId: TOPIC_ID,
    topicTitle: 'Numbers',
    isNew: { shelf: false, book: true, chapter: true },
  });
}

// ---------------------------------------------------------------------------
// QueryClient + real ProfileContext wrapper (via shared harness)
// ---------------------------------------------------------------------------

const TEST_PROFILE = createTestProfile({
  id: PROFILE_ID,
  accountId: ACCOUNT_ID,
  displayName: 'Test Learner',
  isOwner: true,
  birthYear: 1990,
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { wrapper: Wrapper } = createScreenWrapper({
    activeProfile: TEST_PROFILE,
    profiles: [TEST_PROFILE],
    queryClient,
  });
  return { queryClient, Wrapper };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShelfScreen', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = () => ({ subjectId: SUBJECT_ID });
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
      getByText('Missing subject. Please go back and try again.'),
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
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, () => booksPromise);

    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });
    getByTestId('shelf-loading');
    expect(
      StyleSheet.flatten(getByTestId('shelf-loading-animation').props.style),
    ).toEqual(expect.objectContaining({ width: 150, height: 150 }));
    getByText('Opening your shelf...');

    // Resolve to prevent test teardown warnings
    resolveBooksResponse(
      new Response(JSON.stringify({ books: DEFAULT_BOOKS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('loading state has a back button that navigates away', async () => {
    let resolveBooksResponse!: (r: Response) => void;
    const booksPromise = new Promise<Response>((resolve) => {
      resolveBooksResponse = resolve;
    });
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, () => booksPromise);

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });
    fireEvent.press(getByTestId('shelf-loading-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');

    resolveBooksResponse(
      new Response(JSON.stringify({ books: DEFAULT_BOOKS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  // -----------------------------------------------------------------------
  // BUG-82: Error state — retry and back buttons [BUG-82]
  // -----------------------------------------------------------------------
  it('shows error state with retry and back buttons when booksQuery fails [BUG-82]', async () => {
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Failed to load books' }), {
          status: 500,
        }),
      ),
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
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, () => {
      callCount++;
      return Promise.resolve(
        new Response(JSON.stringify({ message: 'Network error' }), {
          status: 500,
        }),
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
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'oops' }), { status: 500 }),
      ),
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
        new Response(JSON.stringify({ message: 'Subjects unavailable' }), {
          status: 500,
        }),
      ),
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
        new Response(JSON.stringify({ message: 'Subjects unavailable' }), {
          status: 500,
        }),
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
    expect(getByTestId('shelf-back').props.accessibilityRole).toBe('button');
    expect(getByTestId('shelf-settings').props.accessibilityRole).toBe(
      'button',
    );
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

  // [WI-1283] handleBack hardcoded '/(app)/library' unconditionally, ignoring
  // MODE_NAV_V2_ENABLED — unlike the flag-aware sibling
  // subject-hub/[subjectId]'s goBack. Under V2 the Subjects tab lives at
  // /(app)/subjects, so Back must land there instead of the legacy Library
  // tab. Both flag states are asserted so a future regression that only
  // fixes one direction is caught.
  it('falls back to the V2 Subjects tab when MODE_NAV_V2_ENABLED is on', async () => {
    const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      true;
    try {
      const { getByTestId } = render(<ShelfScreen />, {
        wrapper: TestWrapper,
      });

      await waitFor(() => {
        getByTestId('shelf-screen');
      });
      fireEvent.press(getByTestId('shelf-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/subjects');
    } finally {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    }
  });

  // [WI-1283] Legacy counterpart to the V2 test above — Back must still land
  // on the legacy Library tab when MODE_NAV_V2_ENABLED is off, preserving
  // today's shipped behavior for the flags-off / V0 / V1 states.
  it('replaces to the legacy Library tab when MODE_NAV_V2_ENABLED is off', async () => {
    const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
    (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
      false;
    try {
      const { getByTestId } = render(<ShelfScreen />, {
        wrapper: TestWrapper,
      });

      await waitFor(() => {
        getByTestId('shelf-screen');
      });
      fireEvent.press(getByTestId('shelf-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    } finally {
      (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
        originalV2;
    }
  });

  it('pressing a book card navigates to the book screen', async () => {
    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId(`book-card-${BOOK_1_ID}`);
    });
    fireEvent.press(getByTestId(`book-card-${BOOK_1_ID}`));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: expect.objectContaining({
          subjectId: SUBJECT_ID,
          bookId: BOOK_1_ID,
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  it('shows empty state when no books exist', async () => {
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, { books: [] });

    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('shelf-empty');
    });
    getByText('This shelf is still getting ready');
    getByText('Pick a book to start');
    getByTestId('shelf-empty-pick-book');
    getByTestId('shelf-empty-retry');
    getByTestId('shelf-empty-back');
  });

  it('empty state pick button opens the book picker', async () => {
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, { books: [] });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-empty-pick-book');
    });
    fireEvent.press(getByTestId('shelf-empty-pick-book'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: SUBJECT_ID },
      }),
    );
  });

  it('empty state retry reloads shelf data', async () => {
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, { books: [] });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('shelf-empty-retry');
    });
    const callsBeforeRetry = fetchCallsMatching(
      mockFetch,
      `/subjects/${SUBJECT_ID}/books`,
    ).length;

    fireEvent.press(getByTestId('shelf-empty-retry'));

    await waitFor(() => {
      expect(
        fetchCallsMatching(mockFetch, `/subjects/${SUBJECT_ID}/books`).length,
      ).toBeGreaterThan(callsBeforeRetry);
    });
  });

  it('empty state back button returns to library', async () => {
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, { books: [] });

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
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, { books: [] });
    mockFetch.setRoute('/book-suggestions', {
      suggestions: [
        makeSuggestion(
          SUGGESTION_1_ID,
          'Geometry Foundations',
          '📐',
          'Triangles, lines, angles.',
        ),
        makeSuggestion(
          SUGGESTION_2_ID,
          'Calculus: The Basics',
          '∫',
          'Limits and derivatives.',
        ),
      ],
      curriculumBookCount: 0,
    });

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
    mockFetch.setRoute(`/subjects/${SUBJECT_ID}/books`, {
      books: [DEFAULT_BOOKS[0]],
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
  it('[BUG-SHELF-BOOK-CTA] shows an add-book path after existing books when there are no suggestions', async () => {
    mockFetch.setRoute('/book-suggestions', {
      suggestions: [],
      curriculumBookCount: 2,
    });

    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('shelf-choose-book');
    });
    getByText('Add another book');

    fireEvent.press(getByTestId('shelf-choose-book'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: SUBJECT_ID },
      }),
    );
  });

  it('labels the choose-book path as browse all when extra suggestions exist', async () => {
    mockFetch.setRoute('/book-suggestions', {
      suggestions: [
        makeSuggestion(SUGGESTION_1_ID, 'Number Theory'),
        makeSuggestion(SUGGESTION_2_ID, 'Calculus Intro'),
        makeSuggestion(SUGGESTION_3_ID, 'Statistics'),
      ],
      curriculumBookCount: 2,
    });

    const { getByTestId, getByText } = render(<ShelfScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('shelf-choose-book');
    });
    getByText('Browse all suggestions');
  });

  it('shows book suggestion cards when suggestions exist', async () => {
    mockFetch.setRoute('/book-suggestions', {
      suggestions: [
        makeSuggestion(SUGGESTION_1_ID, 'Number Theory'),
        makeSuggestion(SUGGESTION_2_ID, 'Calculus Intro'),
      ],
      curriculumBookCount: 2,
    });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId(`shelf-suggestion-${SUGGESTION_1_ID}`);
    });
    getByTestId(`shelf-suggestion-${SUGGESTION_2_ID}`);
  });

  it('picking a book suggestion calls filing and navigates to new book', async () => {
    mockFetch.setRoute('/book-suggestions', {
      suggestions: [makeSuggestion(SUGGESTION_1_ID, 'Number Theory', '🔢')],
      curriculumBookCount: 2,
    });
    mockFetch.setRoute('/filing', {
      shelfId: SUBJECT_ID,
      bookId: NEW_BOOK_ID,
      shelfName: 'Mathematics',
      bookName: 'Number Theory',
      chapter: 'Intro',
      topicId: TOPIC_ID,
      topicTitle: 'Numbers',
      isNew: { shelf: false, book: true, chapter: true },
    });

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId(`shelf-suggestion-${SUGGESTION_1_ID}`);
    });
    fireEvent.press(getByTestId(`shelf-suggestion-${SUGGESTION_1_ID}`));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: {
            subjectId: SUBJECT_ID,
            bookId: NEW_BOOK_ID,
          },
        }),
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

    mockFetch.setRoute('/book-suggestions', {
      suggestions: [makeSuggestion(SUGGESTION_1_ID, 'Number Theory', '🔢')],
      curriculumBookCount: 2,
    });

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
      getByTestId(`shelf-suggestion-${SUGGESTION_1_ID}`);
    });

    fireEvent.press(getByTestId(`shelf-suggestion-${SUGGESTION_1_ID}`));

    // Re-render to pick up isPending state
    rerender(<ShelfScreen />);

    let overlay: ReturnType<typeof getByTestId>;
    await waitFor(() => {
      overlay = getByTestId('shelf-filing-overlay');
    });
    getByTestId('shelf-filing-overlay-panel');
    expect(
      StyleSheet.flatten(getByTestId('shelf-filing-animation').props.style),
    ).toEqual(expect.objectContaining({ width: 96, height: 96 }));
    expect(StyleSheet.flatten(overlay!.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: '#faf5eef5',
      }),
    );

    // Advance past the 15s skip-button delay
    await act(async () => {
      jest.advanceTimersByTime(15_500);
    });
    expect(getByTestId('shelf-filing-skip').props.accessibilityRole).toBe(
      'button',
    );

    // User taps Skip — must replace route AND mark filing as skipped.
    fireEvent.press(getByTestId('shelf-filing-skip'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: SUBJECT_ID },
      }),
    );

    // Switch to real timers before resolving the mutation so act() can drain
    // microtasks properly (fake timers intercept queueMicrotask).
    jest.useRealTimers();

    // Wrap the resolve in act() so the full TanStack Query chain runs:
    // fetch resolve → assertOk → res.json → mutateAsync → continuation.
    // Without act(), the async continuations never execute in the test and the
    // assertion trivially passes even when the filingSkipped guard is absent.
    await act(async () => {
      resolveFilingResponse(
        new Response(
          JSON.stringify({
            shelfId: SUBJECT_ID,
            bookId: NEW_BOOK_ID,
            shelfName: 'Mathematics',
            bookName: 'Number Theory',
            chapter: 'Intro',
            topicId: TOPIC_ID,
            topicTitle: 'Numbers',
            isNew: { shelf: false, book: true, chapter: true },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      // Drain the full Promise chain: fetch resolve → assertOk → res.json →
      // mutateAsync → handlePickSuggestion continuation.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The break: push to the book route must NOT have fired even though
    // the mutation succeeded — filingSkipped.current was true.
    const bookPushed = mockPush.mock.calls.some((call) => {
      const arg = call[0] as { pathname?: string } | undefined;
      return arg?.pathname === '/(app)/shelf/[subjectId]/book/[bookId]';
    });
    expect(bookPushed).toBe(false);
    // Sanity: error overlay also did not appear.
    expect(queryByTestId('shelf-filing-error-overlay')).toBeNull();
  });

  it('shows ErrorFallback overlay when picking a book suggestion fails', async () => {
    mockFetch.setRoute('/book-suggestions', {
      suggestions: [makeSuggestion(SUGGESTION_1_ID, 'Number Theory', '🔢')],
      curriculumBookCount: 2,
    });
    mockFetch.setRoute('/filing', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Filing failed' }), {
          status: 500,
        }),
      ),
    );

    const { getByTestId } = render(<ShelfScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId(`shelf-suggestion-${SUGGESTION_1_ID}`);
    });
    fireEvent.press(getByTestId(`shelf-suggestion-${SUGGESTION_1_ID}`));

    await waitFor(() => {
      getByTestId('shelf-filing-error-overlay');
      getByTestId('shelf-filing-error-retry');
      getByTestId('shelf-filing-error-back');
    });
  });
});
