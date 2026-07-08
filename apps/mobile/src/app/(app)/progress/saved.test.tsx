import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import SavedBookmarksScreen from './saved';

// ── Translation stub ─────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'progress.saved.pageTitle': 'Saved',
        'progress.saved.subjectPageTitle': 'Saved for this subject',
        'progress.saved.subjectSubtitle': 'Bookmarks for this subject',
        'progress.saved.dateToday': 'Today',
        'progress.saved.dateYesterday': 'Yesterday',
        'progress.saved.dateDaysAgo': `${String(opts?.count ?? '')} days ago`,
        'progress.saved.dateWeeksAgo': `${String(opts?.count ?? '')} weeks ago`,
        'progress.saved.bookmarkLabel': `Bookmark from ${String(opts?.subject ?? '')}`,
        'progress.saved.bookmarkLabelNoSubject': 'Bookmark',
        'progress.saved.removeBookmark': 'Remove bookmark',
        'progress.saved.tapToExpand': 'Tap to expand',
        'progress.saved.deleteTitle': 'Delete bookmark?',
        'progress.saved.deleteMessage':
          'This will remove the bookmark permanently.',
        'progress.saved.deleteConfirm': 'Delete',
        'progress.saved.deleteErrorTitle': 'Could not delete bookmark',
        'progress.saved.errorLoad': "We couldn't load your saved items",
        'progress.saved.errorNetwork': 'Check your connection and try again.',
        'progress.saved.retryLabel': 'Retry',
        'progress.saved.emptyTitle': 'Nothing saved yet',
        'progress.saved.emptySubtitle':
          'Bookmark passages during sessions and they will appear here.',
        'progress.saved.goToLibrary': 'Go to library',
        'common.cancel': 'Cancel',
        'common.tryAgain': 'Try Again',
        'common.goBack': 'Go back',
      };
      if (key in map) return map[key]!;
      return key;
    },
  }),
}));

// ── Expo Router ──────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockLocalSearchParams = jest.fn(() => ({}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockLocalSearchParams(),
  useRouter: () => ({
    back: jest.fn(),
    replace: mockReplace,
    push: mockPush,
  }),
}));

// ── External native/UI module boundaries (gc1-allow) ────────────────────────

jest.mock(
  '../../../lib/navigation' /* gc1-allow: unit test boundary; real impl requires expo-router Router */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: Alert.alert is native; stub captures calls for assertion */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

// Ionicons uses native font loading — stub it out
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const mockMarkdownDisplay = jest.fn();

// react-native-markdown-display pulls in native text rendering
jest.mock(
  'react-native-markdown-display' /* gc1-allow: third-party native renderer */,
  () => {
    const React = require('react');
    const { Text } = require('react-native');
    return (props: { children: string }) => {
      mockMarkdownDisplay(props);
      return React.createElement(Text, null, props.children);
    };
  },
);

// ── Hooks under test ─────────────────────────────────────────────────────────

const mockUseBookmarks = jest.fn();
const mockDeleteBookmarkMutateAsync = jest.fn();
const mockUseDeleteBookmark = jest.fn();

jest.mock(
  '../../../hooks/use-bookmarks' /* gc1-allow: hook needs QueryClientProvider + API client; unit-test boundary */,
  () => ({
    useBookmarks: (...args: unknown[]) => mockUseBookmarks(...args),
    useDeleteBookmark: (...args: unknown[]) => mockUseDeleteBookmark(...args),
  }),
);

const mockUseNavigationContract = jest.fn();
jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: hook depends on full app provider tree; stub pins gates for deterministic tests */,
  () => ({
    useNavigationContract: () => mockUseNavigationContract(),
  }),
);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BOOKMARK_1 = {
  id: 'bk-1',
  subjectName: 'Spanish',
  topicTitle: 'Greetings',
  content: 'Hola means hello.',
  createdAt: new Date().toISOString(), // today
};

const BOOKMARK_2 = {
  id: 'bk-2',
  subjectName: 'Math',
  topicTitle: null as string | null,
  content: 'Pythagorean theorem: a² + b² = c²',
  createdAt: new Date().toISOString(),
};

// ── Helper ────────────────────────────────────────────────────────────────────

type BookmarkFixture = {
  id: string;
  subjectName: string;
  topicTitle: string | null;
  content: string;
  createdAt: string;
};

function mockHooks({
  bookmarks = [] as BookmarkFixture[],
  isLoading = false,
  isError = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  fetchNextPage = jest.fn(),
  refetch = jest.fn(),
  showLearningActions = true,
}: {
  bookmarks?: BookmarkFixture[];
  isLoading?: boolean;
  isError?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: jest.Mock;
  refetch?: jest.Mock;
  showLearningActions?: boolean;
} = {}) {
  mockUseBookmarks.mockReturnValue({
    data: isLoading || isError ? undefined : { pages: [{ bookmarks }] },
    isLoading,
    isError,
    error: isError ? new Error('Network failure') : null,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  });

  mockUseDeleteBookmark.mockReturnValue({
    mutateAsync: mockDeleteBookmarkMutateAsync,
  });

  mockUseNavigationContract.mockReturnValue({
    gates: {
      showLearningActions,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SavedBookmarksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkdownDisplay.mockClear();
    mockLocalSearchParams.mockReturnValue({});
    mockDeleteBookmarkMutateAsync.mockResolvedValue(undefined);
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows the loading spinner when bookmarks are loading', () => {
      mockHooks({ isLoading: true });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('saved-loading');
    });

    it('shows the page title while loading', () => {
      mockHooks({ isLoading: true });
      render(<SavedBookmarksScreen />);
      screen.getByText('Saved');
    });

    it('does not render bookmark rows while loading', () => {
      mockHooks({ isLoading: true });
      render(<SavedBookmarksScreen />);
      expect(screen.queryByTestId('bookmark-row-bk-1')).toBeNull();
    });
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows the empty title when there are no bookmarks', () => {
      mockHooks({ bookmarks: [] });
      render(<SavedBookmarksScreen />);
      screen.getByText('Nothing saved yet');
    });

    it('shows the empty subtitle', () => {
      mockHooks({ bookmarks: [] });
      render(<SavedBookmarksScreen />);
      screen.getByText(
        'Bookmark passages during sessions and they will appear here.',
      );
    });

    it('shows the "Go to library" CTA with correct testID', () => {
      mockHooks({ bookmarks: [] });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('saved-empty-library-cta');
    });

    it('navigates directly to library (not via goBackOrReplace) when "Go to library" is pressed [LEARN-24]', () => {
      // [LEARN-24] The CTA copy says "Go to Library" — it must always land on Library.
      // Using goBackOrReplace would pick router.back() when canGoBack() is true,
      // which sends the user back to Progress instead. A direct replace is correct.
      mockHooks({ bookmarks: [] });
      render(<SavedBookmarksScreen />);
      fireEvent.press(screen.getByTestId('saved-empty-library-cta'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
      expect(mockGoBackOrReplace).not.toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/library',
      );
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows the error container when the query fails', () => {
      mockHooks({ isError: true });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('saved-error');
    });

    it('shows the error load text', () => {
      mockHooks({ isError: true });
      render(<SavedBookmarksScreen />);
      screen.getByText("We couldn't load your saved items");
    });

    it('[F-110] routes load error through formatApiError boundary, not raw instanceof check', () => {
      // The screen routes the thrown error through the REAL formatApiError
      // instead of rendering err.message verbatim. A plain Error whose message
      // contains "network" classifies as a network error, so the friendly
      // networkError copy is shown and the raw "Network failure" string never
      // reaches the UI — this verifies the boundary rule (screens must never
      // bypass the shared error classifier) against the real classifier.
      mockHooks({ isError: true });
      render(<SavedBookmarksScreen />);
      expect(screen.queryByText('Network failure')).toBeNull();
      screen.getByText(
        "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
      );
    });

    it('shows retry button with correct testID', () => {
      mockHooks({ isError: true });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('saved-retry');
    });

    it('calls refetch when retry is pressed', () => {
      const refetch = jest.fn();
      mockHooks({ isError: true, refetch });
      render(<SavedBookmarksScreen />);
      fireEvent.press(screen.getByTestId('saved-retry'));
      expect(refetch).toHaveBeenCalled();
    });

    it('shows back button in error state and navigates to progress on press', () => {
      mockHooks({ isError: true });
      render(<SavedBookmarksScreen />);
      const back = screen.getByTestId('saved-error-back');
      fireEvent.press(back);
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/progress',
      );
    });
  });

  // ── Success / happy path ───────────────────────────────────────────────────

  describe('success — bookmark list', () => {
    it('renders one row per bookmark', () => {
      mockHooks({ bookmarks: [BOOKMARK_1, BOOKMARK_2] });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('bookmark-row-bk-1');
      screen.getByTestId('bookmark-row-bk-2');
    });

    it('renders subject name in the row', () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      screen.getByText(/Spanish/);
    });

    it('uses the no-subject accessibility label when a bookmark subject is blank', () => {
      mockHooks({
        bookmarks: [{ ...BOOKMARK_1, subjectName: '   ' }],
      });
      render(<SavedBookmarksScreen />);

      expect(screen.getByLabelText('Bookmark')).toBeTruthy();
      expect(screen.queryByLabelText('Bookmark from')).toBeNull();
    });

    it('renders topic title alongside subject name when present', () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      // subject · topic format
      screen.getByText(/Greetings/);
    });

    it('renders bookmark content as collapsed text (max 5 lines)', () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      screen.getByText('Hola means hello.');
    });

    it('renders expanded bookmark content through markdown when the row is pressed', () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);

      expect(mockMarkdownDisplay).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('bookmark-row-bk-1'));

      screen.getByText('Hola means hello.');
      expect(mockMarkdownDisplay).toHaveBeenCalledWith(
        expect.objectContaining({
          children: 'Hola means hello.',
          mergeStyle: false,
        }),
      );
    });

    it('shows page title "Saved" when no subjectId param', () => {
      mockLocalSearchParams.mockReturnValue({});
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      screen.getByText('Saved');
    });

    it('shows subject-scoped title when subjectId param is set', () => {
      mockLocalSearchParams.mockReturnValue({ subjectId: 's1' });
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      screen.getByText('Saved for this subject');
      screen.getByText('Bookmarks for this subject');
    });

    it('the FlatList renders with the correct testID', () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('saved-bookmarks-list');
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  describe('navigation', () => {
    it('back button calls goBackOrReplace to progress route', () => {
      mockHooks({ bookmarks: [] });
      render(<SavedBookmarksScreen />);
      fireEvent.press(screen.getByTestId('saved-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/progress',
      );
    });
  });

  // ── Delete bookmark ────────────────────────────────────────────────────────

  describe('delete bookmark', () => {
    it('shows delete button for owner (non-proxy) users', () => {
      mockHooks({ bookmarks: [BOOKMARK_1], showLearningActions: true });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('bookmark-delete-bk-1');
    });

    it('hides delete button when learning actions are blocked', () => {
      mockHooks({ bookmarks: [BOOKMARK_1], showLearningActions: false });
      render(<SavedBookmarksScreen />);
      expect(screen.queryByTestId('bookmark-delete-bk-1')).toBeNull();
    });

    it('shows a confirmation dialog before deleting', () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      fireEvent.press(screen.getByTestId('bookmark-delete-bk-1'));
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Delete bookmark?',
        'This will remove the bookmark permanently.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Delete', style: 'destructive' }),
        ]),
      );
    });

    it('does not delete until user confirms', () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      fireEvent.press(screen.getByTestId('bookmark-delete-bk-1'));
      expect(mockDeleteBookmarkMutateAsync).not.toHaveBeenCalled();
    });

    it('calls deleteBookmark.mutateAsync with the bookmark id after confirmation', async () => {
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      fireEvent.press(screen.getByTestId('bookmark-delete-bk-1'));

      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((b) => b.text === 'Delete')?.onPress?.();

      await waitFor(() => {
        expect(mockDeleteBookmarkMutateAsync).toHaveBeenCalledWith('bk-1');
      });
    });

    it('[F-110] routes delete error through formatApiError boundary, not raw instanceof check', async () => {
      // A message containing "network" makes the REAL classifier return the
      // friendly networkError copy — distinguishable from the raw err.message,
      // so this fails if the screen ever renders err.message directly again.
      const deleteErr = new Error('network failure during delete');
      mockDeleteBookmarkMutateAsync.mockRejectedValueOnce(deleteErr);
      mockHooks({ bookmarks: [BOOKMARK_1] });
      render(<SavedBookmarksScreen />);
      fireEvent.press(screen.getByTestId('bookmark-delete-bk-1'));

      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((b) => b.text === 'Delete')?.onPress?.();

      await waitFor(() => {
        expect(mockPlatformAlert).toHaveBeenLastCalledWith(
          'Could not delete bookmark',
          "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
        );
      });
    });
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('does not show footer spinner when not fetching next page', () => {
      mockHooks({
        bookmarks: [BOOKMARK_1],
        hasNextPage: true,
        isFetchingNextPage: false,
      });
      render(<SavedBookmarksScreen />);
      // Footer spinner does not render when isFetchingNextPage is false
      // (it renders inside ListFooterComponent only when isFetchingNextPage is true)
      // We can't directly assert the absence of the spinner here by testID because
      // ActivityIndicator has no testID in the footer; we just ensure no crash.
      expect(screen.getByTestId('saved-bookmarks-list'));
    });
  });

  // ── Parent/child boundary ──────────────────────────────────────────────────

  describe('parent proxy (guardian viewing child bookmarks)', () => {
    it('shows bookmarks without delete buttons when in parent-proxy mode', () => {
      mockHooks({
        bookmarks: [BOOKMARK_1, BOOKMARK_2],
        showLearningActions: false,
      });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('bookmark-row-bk-1');
      screen.getByTestId('bookmark-row-bk-2');
      expect(screen.queryByTestId('bookmark-delete-bk-1')).toBeNull();
      expect(screen.queryByTestId('bookmark-delete-bk-2')).toBeNull();
    });
  });

  // ── Navigation contract gate ──────────────────────────────────────────────

  describe('navigation contract — showLearningActions drives delete affordance', () => {
    it('hides delete button when gate is false', () => {
      mockHooks({
        bookmarks: [BOOKMARK_1],
        showLearningActions: false,
      });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('bookmark-row-bk-1');
      expect(screen.queryByTestId('bookmark-delete-bk-1')).toBeNull();
    });

    it('shows delete button when gate is true', () => {
      mockHooks({
        bookmarks: [BOOKMARK_1],
        showLearningActions: true,
      });
      render(<SavedBookmarksScreen />);
      screen.getByTestId('bookmark-delete-bk-1');
    });
  });
});
