import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import PickBookScreen from './[subjectId]';

// --- Mocks ---

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

const mockMutateAsync = jest.fn();

const mockRefetch = jest.fn();

const mockUseBookSuggestions = jest.fn((): any => ({
  data: [
    {
      id: 'sug-1',
      title: 'Europe',
      emoji: null,
      description: 'European geography',
    },
    {
      id: 'sug-2',
      title: 'Asia',
      emoji: null,
      description: 'Asian geography',
    },
  ],
  isLoading: false,
  isError: false,
  error: null,
  refetch: mockRefetch,
}));

jest.mock('../../../hooks/use-book-suggestions', () => ({
  useBookSuggestions: () => mockUseBookSuggestions(),
}));

let mockSubjectsData: Array<{ id: string; name: string }> | undefined = [
  { id: 'sub-1', name: 'Geography' },
];

jest.mock('../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: mockSubjectsData,
  }),
}));

let mockFilingIsPending = false;
jest.mock('../../../hooks/use-filing', () => ({
  useFiling: () => ({
    mutateAsync: mockMutateAsync,
    get isPending() {
      return mockFilingIsPending;
    },
  }),
}));

describe('PickBookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockFilingIsPending = false;
  });

  it('renders suggestion cards', () => {
    const { getByText } = render(<PickBookScreen />);
    expect(getByText('Europe')).toBeTruthy();
    expect(getByText('Asia')).toBeTruthy();
  });

  it('renders subject name as heading', () => {
    const { getByText } = render(<PickBookScreen />);
    expect(getByText('Geography')).toBeTruthy();
  });

  it('renders "Something else..." option', () => {
    const { getByText } = render(<PickBookScreen />);
    expect(getByText('Something else...')).toBeTruthy();
  });

  it('renders "Pick what interests you" subtitle', () => {
    const { getByText } = render(<PickBookScreen />);
    expect(getByText('Pick what interests you')).toBeTruthy();
  });

  it('navigates to book on successful filing', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      shelfId: 'shelf-1',
      bookId: 'book-1',
      shelfName: 'Geography',
      bookName: 'Europe',
      chapter: 'Western Europe',
      topicId: 'topic-1',
      topicTitle: 'France',
      isNew: { shelf: false, book: true, chapter: true },
    });

    const { getByText } = render(<PickBookScreen />);
    fireEvent.press(getByText('Europe'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          rawInput: 'Europe',
          selectedSuggestion: 'Europe',
          pickedSuggestionId: 'sug-1',
        })
      );
    });

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
    mockMutateAsync.mockResolvedValueOnce({
      shelfId: 'shelf-1',
      bookId: 'book-1',
      shelfName: 'Geography',
      bookName: 'Europe',
      chapter: 'Western Europe',
      topicId: 'topic-1',
      topicTitle: 'France',
      isNew: { shelf: false, book: true, chapter: true },
    });
    const { getByText } = render(<PickBookScreen />);
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
    mockMutateAsync.mockResolvedValueOnce({
      shelfId: 'shelf-9',
      bookId: 'book-9',
      shelfName: 'Geography',
      bookName: 'My custom book',
      chapter: 'C1',
      topicId: 'topic-9',
      topicTitle: 'T1',
      isNew: { shelf: false, book: true, chapter: true },
    });
    const { getByText, getByTestId } = render(<PickBookScreen />);
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
    mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));

    const { getByText } = render(<PickBookScreen />);
    fireEvent.press(getByText('Europe'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Something went wrong',
        expect.stringContaining("Couldn't set up that book"),
        expect.any(Array),
        undefined
      );
    });

    // Navigation should NOT have been called
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows custom input when "Something else..." is tapped', () => {
    const { getByText, getByTestId } = render(<PickBookScreen />);
    fireEvent.press(getByText('Something else...'));
    expect(getByTestId('pick-book-custom-input')).toBeTruthy();
  });

  it('shows loading spinner when suggestions are loading', () => {
    mockUseBookSuggestions.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { getByTestId } = render(<PickBookScreen />);
    expect(getByTestId('pick-book-loading')).toBeTruthy();
  });

  it('shows error message and retry button on fetch error', () => {
    mockUseBookSuggestions.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: null,
      refetch: mockRefetch,
    });

    const { getByTestId, getByText } = render(<PickBookScreen />);
    expect(getByTestId('pick-book-error')).toBeTruthy();
    // UX-DE-M11: recoveryActions maps retry → "Try Again" label (app-wide convention)
    expect(getByText('Try Again')).toBeTruthy();
    expect(getByTestId('pick-book-back-button')).toBeTruthy();
  });

  it('auto-opens custom input when suggestions are empty', () => {
    mockUseBookSuggestions.mockReturnValueOnce({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { getByTestId } = render(<PickBookScreen />);
    // BUG-318: When suggestions load empty, custom input auto-opens
    // so the user doesn't have to find "Something else..."
    expect(getByTestId('pick-book-custom-input')).toBeTruthy();
  });

  it('back button replaces shelf without relying on back history', () => {
    const { getByTestId } = render(<PickBookScreen />);
    fireEvent.press(getByTestId('pick-book-back'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  // [BUG-808] When the URL subjectId is malformed or stale (i.e. subjects
  // does not contain a row with that id), the screen must NOT crash — it
  // should fall back to the "Subject" generic heading and stay usable.
  // Previously a `subject!.id` non-null assertion in this flow would throw.
  describe('— stale subjectId regression', () => {
    afterEach(() => {
      mockSubjectsData = [{ id: 'sub-1', name: 'Geography' }];
    });

    it('renders fallback heading when subject lookup misses', () => {
      mockSubjectsData = []; // simulates fresh app launch / cache miss
      const { getByText, getByTestId } = render(<PickBookScreen />);
      expect(getByText('Subject')).toBeTruthy();
      expect(getByTestId('pick-book-screen')).toBeTruthy();
    });

    it('still allows filing a suggestion when subject is undefined', async () => {
      mockSubjectsData = undefined;
      mockMutateAsync.mockResolvedValueOnce({
        shelfId: 'shelf-2',
        bookId: 'book-2',
        shelfName: 'Geography',
        bookName: 'Europe',
        chapter: 'Western Europe',
        topicId: 'topic-2',
        topicTitle: 'France',
        isNew: { shelf: false, book: true, chapter: true },
      });

      const { getByText } = render(<PickBookScreen />);
      fireEvent.press(getByText('Europe'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            rawInput: 'Europe',
            pickedSuggestionId: 'sug-1',
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
      // Manual deferred — resolve after Skip is pressed.
      let resolveFiling!: (v: unknown) => void;
      const filingPromise = new Promise((resolve) => {
        resolveFiling = resolve;
      });
      mockMutateAsync.mockImplementation(() => {
        // Flip pending true synchronously so the next render shows overlay.
        mockFilingIsPending = true;
        return filingPromise;
      });

      const { getByText, getByTestId, rerender } = render(<PickBookScreen />);

      // Trigger handlePickSuggestion — kicks off filing.mutateAsync
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
      resolveFiling({
        shelfId: 'sub-1',
        bookId: 'book-late',
        shelfName: 'Geography',
        bookName: 'Europe',
        chapter: 'Western Europe',
        topicId: 'topic-late',
        topicTitle: 'France',
        isNew: { shelf: false, book: true, chapter: true },
      });

      // Flush microtasks so the await continuation runs.
      jest.useRealTimers();
      await filingPromise;
      await Promise.resolve();

      // The stale navigation must NOT fire.
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
