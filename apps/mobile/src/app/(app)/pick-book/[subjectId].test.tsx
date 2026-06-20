import { fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import type { RoutedMockFetch } from '../../../test-utils/mock-api-routes';
import {
  renderScreen,
  cleanupScreen,
} from '../../../../test-utils/screen-render';
import PickBookScreen from './[subjectId]';

// ---------------------------------------------------------------------------
// Fetch-boundary mock — mockFetch assigned inside factory to bypass hoisting.
// lib/api-client is mocked at the transport boundary so the real Hono RPC
// client routes through our routed mock fetch, keeping React Query, assertOk,
// and all hooks real.
// ---------------------------------------------------------------------------

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../lib/api-client', // gc1-allow: transport-boundary — routed mock fetch drives real hooks
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

// ---------------------------------------------------------------------------
// External / rendering mocks (kept — not API hooks)
// ---------------------------------------------------------------------------

jest.mock(
  'react-native-safe-area-context', // gc1-allow: native-boundary
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock(
  '../../../components/common', // gc1-allow: native-boundary — animation components use react-native-reanimated unavailable in Jest
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
    MagicPenAnimation: ({
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
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

// Mutable so individual tests can drop subjectId to exercise the missing-param
// guard. Reset to the default in beforeEach.
let mockSearchParams: { subjectId?: string } = { subjectId: 'sub-1' };

jest.mock(
  'expo-router', // gc1-allow: native-boundary
  () => ({
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: mockReplace,
      canGoBack: mockCanGoBack,
    }),
  }),
);

// ---------------------------------------------------------------------------
// Default API route responses
// ---------------------------------------------------------------------------

const DEFAULT_SUGGESTIONS = {
  suggestions: [
    {
      id: 'sug-1',
      title: 'Europe',
      emoji: null,
      description: 'European geography',
      category: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      pickedAt: null,
    },
    {
      id: 'sug-2',
      title: 'Asia',
      emoji: null,
      description: 'Asian geography',
      category: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      pickedAt: null,
    },
  ],
  curriculumBookCount: 0,
};

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
// Tests
// ---------------------------------------------------------------------------

// Helper: render with real ProfileContext (soloLearner) + routed mock fetch
// already wired into lib/api-client mock above.
function renderPickBook() {
  return renderScreen(<PickBookScreen />, {
    profile: 'soloLearner',
    routedFetch: mockFetch,
    installGlobalFetch: false,
  });
}

describe('PickBookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockSearchParams = { subjectId: 'sub-1' };
    resetRoutes();
  });

  afterEach(() => {
    cleanupScreen();
  });

  it('renders suggestion cards', async () => {
    const { result } = renderPickBook();

    await waitFor(
      () => {
        result.getByText('Europe');
      },
      { timeout: 8_000 },
    );
    result.getByText('Asia');
  });

  it('renders subject name as heading', async () => {
    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByText('Geography');
    });
  });

  it('renders "Something else..." option', async () => {
    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByText('Something else...');
    });
  });

  it('renders "Pick what interests you" subtitle', async () => {
    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByText('Pick what interests you');
    });
  });

  it('navigates to book on successful filing', async () => {
    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByText('Europe');
    });
    fireEvent.press(result.getByText('Europe'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId: 'shelf-1', bookId: 'book-1' },
        }),
      );
    });
  });

  // [BUG-693 / M-13] BREAK TEST. The success push must seed the destination
  // shelf stack with the shelf-list ancestor BEFORE pushing the book leaf,
  // so back from the book screen lands on shelf — not Tabs Home.
  it('seeds the shelf ancestor before pushing the book leaf on suggestion success', async () => {
    const { result } = renderPickBook();

    // 3000ms allows for the 800ms useStickyLoading hold plus React re-render
    // overhead that accumulates after prior tests in this file.
    await waitFor(
      () => {
        result.getByText('Europe');
      },
      { timeout: 3000 },
    );
    fireEvent.press(result.getByText('Europe'));

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

    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByText('Something else...');
    });
    fireEvent.press(result.getByText('Something else...'));
    fireEvent.changeText(
      result.getByTestId('pick-book-custom-input'),
      'My custom book',
    );
    fireEvent.press(result.getByTestId('pick-book-custom-submit'));

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
        new Response(JSON.stringify({ message: 'Network error' }), {
          status: 500,
        }),
      ),
    );

    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByText('Europe');
    });
    fireEvent.press(result.getByText('Europe'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Something didn't load",
        expect.stringContaining("Couldn't set up that book"),
        expect.any(Array),
        undefined,
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows custom input when "Something else..." is tapped', async () => {
    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByText('Something else...');
    });
    fireEvent.press(result.getByText('Something else...'));
    result.getByTestId('pick-book-custom-input');
  });

  it('shows loading spinner when suggestions are loading', async () => {
    let resolveResponse!: (r: Response) => void;
    const suggestionsPromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    mockFetch.setRoute('/book-suggestions', () => suggestionsPromise);

    const { result } = renderPickBook();
    result.getByTestId('pick-book-loading');
    expect(
      StyleSheet.flatten(
        result.getByTestId('pick-book-loading-animation').props.style,
      ),
    ).toEqual(expect.objectContaining({ width: 150, height: 150 }));

    resolveResponse(
      new Response(JSON.stringify(DEFAULT_SUGGESTIONS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('keeps manual entry available when suggestions fetch fails', async () => {
    mockFetch.setRoute('/book-suggestions', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Failed' }), { status: 500 }),
      ),
    );

    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByTestId('pick-book-suggestions-inline-error');
    });
    expect(result.queryByTestId('pick-book-error')).toBeNull();
    result.getByText('Suggestions did not load');
    result.getByTestId('pick-book-inline-retry');
    result.getByTestId('pick-book-custom-input');
  });

  it('keeps manual entry available when suggestions return 404', async () => {
    // Previously this case dead-ended the screen on the assumption that a
    // 404 always meant the subject itself was gone. In practice the topup
    // route can return 404 / "no longer exists" for transient LLM failures,
    // and even when the subject is genuinely missing the filing call will
    // surface its own per-attempt alert. Falling through to inline error +
    // manual entry matches the UX-Resilience rule: never strand the user.
    mockFetch.setRoute('/book-suggestions', () =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Subject not found' }), {
          status: 404,
        }),
      ),
    );

    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByTestId('pick-book-suggestions-inline-error');
    });
    expect(result.queryByTestId('pick-book-error')).toBeNull();
    result.getByText('Suggestions did not load');
    result.getByTestId('pick-book-inline-retry');
    result.getByTestId('pick-book-custom-input');
  });

  it('auto-opens custom input when suggestions are empty', async () => {
    mockFetch.setRoute('/book-suggestions', {
      suggestions: [],
      curriculumBookCount: 0,
    });

    const { result } = renderPickBook();

    // useStickyLoading holds the loading view for 800ms after the query resolves.
    // The full-suite environment adds ~200ms of overhead; 3s gives safe headroom.
    await waitFor(
      () => {
        // BUG-318: When suggestions load empty, custom input auto-opens
        result.getByTestId('pick-book-custom-input');
      },
      { timeout: 3000 },
    );
  });

  it('back button replaces shelf without relying on back history', async () => {
    const { result } = renderPickBook();

    await waitFor(() => {
      result.getByTestId('pick-book-back');
    });
    fireEvent.press(result.getByTestId('pick-book-back'));

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

      const { result } = renderPickBook();

      await waitFor(() => {
        result.getByTestId('pick-book-screen');
      });
      result.getByText('Subject');
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

      const { result } = renderPickBook();

      await waitFor(() => {
        result.getByText('Europe');
      });
      fireEvent.press(result.getByText('Europe'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          }),
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Suggestion grouping by category
  // ---------------------------------------------------------------------------

  describe('suggestion grouping by category', () => {
    it('renders flat grid when hasAnyBook = false', async () => {
      mockFetch.setRoute('/book-suggestions', {
        suggestions: [
          {
            id: 'g1',
            title: 'A',
            emoji: null,
            description: 'd',
            category: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            pickedAt: null,
          },
          {
            id: 'g2',
            title: 'B',
            emoji: null,
            description: 'd',
            category: 'explore',
            createdAt: '2024-01-01T00:00:00.000Z',
            pickedAt: null,
          },
        ],
        curriculumBookCount: 0,
      });

      const { result } = renderPickBook();

      await waitFor(() => {
        result.getByTestId('pick-book-suggestion-grid-flat');
      });
      expect(
        result.queryByTestId('pick-book-suggestion-section-related'),
      ).toBeNull();
      expect(
        result.queryByTestId('pick-book-suggestion-section-explore'),
      ).toBeNull();
    });

    it('renders related + explore sections when hasAnyBook = true', async () => {
      mockFetch.setRoute('/book-suggestions', {
        suggestions: [
          {
            id: 'g1',
            title: 'A',
            emoji: null,
            description: 'd',
            category: 'related',
            createdAt: '2024-01-01T00:00:00.000Z',
            pickedAt: null,
          },
          {
            id: 'g2',
            title: 'B',
            emoji: null,
            description: 'd',
            category: 'explore',
            createdAt: '2024-01-01T00:00:00.000Z',
            pickedAt: null,
          },
        ],
        curriculumBookCount: 3,
      });

      const { result } = renderPickBook();

      await waitFor(() => {
        result.getByTestId('pick-book-suggestion-section-related');
      });
      expect(result.getByTestId('pick-book-suggestion-section-explore'));
      expect(result.queryByTestId('pick-book-suggestion-grid-flat')).toBeNull();
    });

    it('renders legacy null-category section under headers when hasAnyBook = true', async () => {
      mockFetch.setRoute('/book-suggestions', {
        suggestions: [
          {
            id: 'g1',
            title: 'Old',
            emoji: null,
            description: 'd',
            category: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            pickedAt: null,
          },
          {
            id: 'g2',
            title: 'New',
            emoji: null,
            description: 'd',
            category: 'explore',
            createdAt: '2024-01-01T00:00:00.000Z',
            pickedAt: null,
          },
        ],
        curriculumBookCount: 2,
      });

      const { result } = renderPickBook();

      await waitFor(() => {
        result.getByTestId('pick-book-suggestion-section-explore');
      });
      expect(result.getByTestId('pick-book-suggestion-section-legacy'));
      expect(
        result.queryByTestId('pick-book-suggestion-section-related'),
      ).toBeNull();
    });

    it('suppresses section header when its category is empty', async () => {
      mockFetch.setRoute('/book-suggestions', {
        suggestions: [
          {
            id: 'g1',
            title: 'A',
            emoji: null,
            description: 'd',
            category: 'related',
            createdAt: '2024-01-01T00:00:00.000Z',
            pickedAt: null,
          },
        ],
        curriculumBookCount: 2,
      });

      const { result } = renderPickBook();

      // The screen intentionally sticky-holds its loading state for 800ms, and
      // full related-suite runs add enough overhead that the default waitFor
      // timeout can expire before the grouped suggestions render.
      await waitFor(
        () => {
          result.getByTestId('pick-book-suggestion-section-related');
        },
        { timeout: 3000 },
      );
      expect(
        result.queryByTestId('pick-book-suggestion-section-explore'),
      ).toBeNull();
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

      const { result } = renderPickBook();

      await waitFor(() => {
        result.getByText('Europe');
      });

      // Trigger handlePickSuggestion — kicks off filing
      fireEvent.press(result.getByText('Europe'));
      result.rerender(<PickBookScreen />);
      const overlay = result.getByTestId('pick-book-filing-overlay');
      result.getByTestId('pick-book-filing-overlay-panel');
      expect(
        StyleSheet.flatten(
          result.getByTestId('pick-book-filing-animation').props.style,
        ),
      ).toEqual(expect.objectContaining({ width: 96, height: 96 }));
      expect(StyleSheet.flatten(overlay.props.style)).toEqual(
        expect.objectContaining({
          backgroundColor: '#faf5eef5',
        }),
      );

      // Force the showSkip timer to fire (8s) so the Skip button renders.
      await act(async () => {
        jest.advanceTimersByTime(8_000);
      });
      result.rerender(<PickBookScreen />);

      const skipBtn = result.getByTestId('pick-book-filing-skip');
      fireEvent.press(skipBtn);

      // Skip routed user to the shelf.
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 'sub-1' },
      });

      // Switch to real timers before resolving the mutation so act() can drain
      // microtasks properly (fake timers intercept queueMicrotask).
      jest.useRealTimers();

      // Wrap the resolve in act() so the full TanStack Query chain runs:
      // fetch resolve → assertOk → res.json → mutateAsync → continuation.
      // Without act(), the async continuations never execute in the test and the
      // assertion trivially passes even when the filingSkipped guard is absent.
      await act(async () => {
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

      // The stale navigation must NOT fire.
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('missing subjectId param guard', () => {
    it('renders the missing-param guard when subjectId is absent', () => {
      mockSearchParams = {};

      const { result } = renderPickBook();

      result.getByTestId('pick-book-missing-param');
      result.getByTestId('pick-book-missing-param-back');
      // The normal picker shell must NOT mount without a subjectId.
      expect(result.queryByTestId('pick-book-screen')).toBeNull();
      expect(result.queryByTestId('pick-book-loading')).toBeNull();
    });

    it('missing-param back button replaces to the library', () => {
      mockSearchParams = {};

      const { result } = renderPickBook();

      fireEvent.press(result.getByTestId('pick-book-missing-param-back'));

      expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    });
  });

  describe('[BUG-539] slow-loading hint', () => {
    // Restore real timers even if an assertion throws mid-test, so fake timers
    // never leak into a sibling test.
    afterEach(() => {
      jest.useRealTimers();
    });

    it('reveals the slow-loading hint only after the slow timer elapses', async () => {
      jest.useFakeTimers();

      // Never-resolving suggestions keep the query in its loading state so the
      // slow-hint timer (SLOW_LOADING_HINT_MS = 5000ms) can fire deterministically.
      // The executor intentionally never calls resolve/reject, so the promise
      // never settles.
      const pendingForever = new Promise<Response>(() => undefined);
      mockFetch.setRoute('/book-suggestions', () => pendingForever);

      const { result } = renderPickBook();

      // Loading view is up, slow hint is not yet present.
      result.getByTestId('pick-book-loading');
      expect(result.queryByTestId('pick-book-loading-slow')).toBeNull();

      // Just before the threshold: still no hint.
      await act(async () => {
        jest.advanceTimersByTime(4_999);
      });
      result.rerender(<PickBookScreen />);
      expect(result.queryByTestId('pick-book-loading-slow')).toBeNull();

      // Crossing the 5s threshold reveals the hint.
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      result.rerender(<PickBookScreen />);
      result.getByTestId('pick-book-loading-slow');
    });
  });
});
