import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RoutedMockFetch } from '../../../test-utils/mock-api-routes';
import PickBookScreen from './[subjectId]';

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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../components/common', () => ({
  BookPageFlipAnimation: () => null,
  MagicPenAnimation: () => null,
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ subjectId: 'sub-1' }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

// ---------------------------------------------------------------------------
// Default API route responses
// ---------------------------------------------------------------------------

const DEFAULT_SUGGESTIONS = [
  { id: 'sug-1', title: 'Europe', emoji: null, description: 'European geography' },
  { id: 'sug-2', title: 'Asia', emoji: null, description: 'Asian geography' },
];

const DEFAULT_SUBJECTS = [{ id: 'sub-1', name: 'Geography' }];

const DEFAULT_FILING_RESULT = {
  shelfId: 'shelf-1',
  bookId: 'book-1',
  shelfName: 'Geography',
  bookName: 'Europe',
  chapter: 'Western Europe',
  topicId: 'topic-1',
  topicTitle: 'France',
  isNew: { shelf: false, book: true, chapter: true },
};

function resetRoutes() {
  // Most-specific first: book-suggestions before subjects
  mockFetch.setRoute('/book-suggestions', DEFAULT_SUGGESTIONS);
  mockFetch.setRoute('/subjects', { subjects: DEFAULT_SUBJECTS });
  mockFetch.setRoute('/filing', DEFAULT_FILING_RESULT);
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

describe('PickBookScreen', () => {
  let TestWrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    resetRoutes();
    const { Wrapper } = createWrapper();
    TestWrapper = Wrapper;
  });

  it('renders suggestion cards', async () => {
    const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByText('Europe');
    });
    getByText('Asia');
  });

  it('renders subject name as heading', async () => {
    const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByText('Geography');
    });
  });

  it('renders "Something else..." option', async () => {
    const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByText('Something else...');
    });
  });

  it('renders "Pick what interests you" subtitle', async () => {
    const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByText('Pick what interests you');
    });
  });

  it('navigates to book on successful filing', async () => {
    const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByText('Europe');
    });
    fireEvent.press(getByText('Europe'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId: 'shelf-1', bookId: 'book-1' },
        })
      );
    });
  });

  // [BUG-693 / M-13] BREAK TEST. The success push must seed the destination
  // shelf stack with the shelf-list ancestor BEFORE pushing the book leaf,
  // so back from the book screen lands on shelf — not Tabs Home.
  it('seeds the shelf ancestor before pushing the book leaf on suggestion success', async () => {
    const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByText('Europe');
    });
    fireEvent.press(getByText('Europe'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledTimes(2);
    });
    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'shelf-1' },
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId: 'shelf-1', bookId: 'book-1' },
    });
  });

  it('seeds the shelf ancestor before pushing the book leaf on custom-text success', async () => {
    mockFetch.setRoute('/filing', {
      shelfId: 'shelf-9',
      bookId: 'book-9',
      shelfName: 'Geography',
      bookName: 'My custom book',
      chapter: 'C1',
      topicId: 'topic-9',
      topicTitle: 'T1',
      isNew: { shelf: false, book: true, chapter: true },
    });

    const { getByText, getByTestId } = render(<PickBookScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByText('Something else...');
    });
    fireEvent.press(getByText('Something else...'));
    fireEvent.changeText(
      getByTestId('pick-book-custom-input'),
      'My custom book'
    );
    fireEvent.press(getByTestId('pick-book-custom-submit'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledTimes(2);
    });
    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'shelf-9' },
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId: 'shelf-9', bookId: 'book-9' },
    });
  });

  it('shows alert on filing failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockFetch.setRoute('/filing', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Network error' }), { status: 500 })
      )
    );

    const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByText('Europe');
    });
    fireEvent.press(getByText('Europe'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Something went wrong',
        expect.stringContaining("Couldn't set up that book"),
        expect.any(Array),
        undefined
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows custom input when "Something else..." is tapped', async () => {
    const { getByText, getByTestId } = render(<PickBookScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByText('Something else...');
    });
    fireEvent.press(getByText('Something else...'));
    getByTestId('pick-book-custom-input');
  });

  it('shows loading spinner when suggestions are loading', async () => {
    let resolveResponse!: (r: Response) => void;
    const suggestionsPromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    mockFetch.setRoute('/book-suggestions', () => suggestionsPromise);

    const { getByTestId } = render(<PickBookScreen />, { wrapper: TestWrapper });
    getByTestId('pick-book-loading');

    resolveResponse(
      new Response(JSON.stringify(DEFAULT_SUGGESTIONS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('shows error message and retry button on fetch error', async () => {
    mockFetch.setRoute('/book-suggestions', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Failed' }), { status: 500 })
      )
    );

    const { getByTestId, getByText } = render(<PickBookScreen />, {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      getByTestId('pick-book-error');
    });
    // UX-DE-M11: recoveryActions maps retry → "Try Again" label (app-wide convention)
    getByText('Try Again');
    getByTestId('pick-book-back-button');
  });

  it('auto-opens custom input when suggestions are empty', async () => {
    mockFetch.setRoute('/book-suggestions', []);

    const { getByTestId } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      // BUG-318: When suggestions load empty, custom input auto-opens
      getByTestId('pick-book-custom-input');
    });
  });

  it('back button replaces shelf without relying on back history', async () => {
    const { getByTestId } = render(<PickBookScreen />, { wrapper: TestWrapper });

    await waitFor(() => {
      getByTestId('pick-book-back');
    });
    fireEvent.press(getByTestId('pick-book-back'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  // [BUG-808] When the URL subjectId is malformed or stale (i.e. subjects
  // does not contain a row with that id), the screen must NOT crash.
  describe('— stale subjectId regression', () => {
    it('renders fallback heading when subject lookup misses', async () => {
      mockFetch.setRoute('/subjects', { subjects: [] });

      const { getByText, getByTestId } = render(<PickBookScreen />, {
        wrapper: TestWrapper,
      });

      await waitFor(() => {
        getByTestId('pick-book-screen');
      });
      getByText('Subject');
    });

    it('still allows filing a suggestion when subject is undefined', async () => {
      mockFetch.setRoute('/subjects', { subjects: [] });
      mockFetch.setRoute('/filing', {
        shelfId: 'shelf-2',
        bookId: 'book-2',
        shelfName: 'Geography',
        bookName: 'Europe',
        chapter: 'Western Europe',
        topicId: 'topic-2',
        topicTitle: 'France',
        isNew: { shelf: false, book: true, chapter: true },
      });

      const { getByText } = render(<PickBookScreen />, { wrapper: TestWrapper });

      await waitFor(() => {
        getByText('Europe');
      });
      fireEvent.press(getByText('Europe'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          })
        );
      });
    });
  });

  // [BUG-692] Tapping Skip while filing is in flight must (1) navigate the
  // user to the shelf via router.replace and (2) drop the post-await
  // router.push that would otherwise land them on a book they did not pick.
  describe('[BUG-692] filing skip cancels stale navigation', () => {
    it('skip button drops the post-await router.push when mutation resolves later', async () => {
      jest.useFakeTimers();

      let resolveFiling!: (r: Response) => void;
      const filingPromise = new Promise<Response>((resolve) => {
        resolveFiling = resolve;
      });
      mockFetch.setRoute('/filing', () => {
        // Signal pending state via response delay
        return filingPromise;
      });

      const { getByText, getByTestId, rerender } = render(<PickBookScreen />, {
        wrapper: TestWrapper,
      });

      await waitFor(() => {
        getByText('Europe');
      });

      // Trigger handlePickSuggestion — kicks off filing
      fireEvent.press(getByText('Europe'));
      rerender(<PickBookScreen />);

      // Force the showSkip timer to fire (8s) so the Skip button renders.
      jest.advanceTimersByTime(8_000);
      rerender(<PickBookScreen />);

      const skipBtn = getByTestId('pick-book-filing-skip');
      fireEvent.press(skipBtn);

      // Skip routed user to the shelf.
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 'sub-1' },
      });

      // Now the slow filing call resolves AFTER the user already escaped.
      resolveFiling(
        new Response(
          JSON.stringify({
            shelfId: 'sub-1',
            bookId: 'book-late',
            shelfName: 'Geography',
            bookName: 'Europe',
            chapter: 'Western Europe',
            topicId: 'topic-late',
            topicTitle: 'France',
            isNew: { shelf: false, book: true, chapter: true },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      // Flush microtasks so the await continuation runs.
      jest.useRealTimers();
      await filingPromise;
      await Promise.resolve();

      // The stale navigation must NOT fire.
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
