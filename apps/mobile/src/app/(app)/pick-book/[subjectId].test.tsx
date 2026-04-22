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

jest.mock('../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: [{ id: 'sub-1', name: 'Geography' }],
  }),
}));

jest.mock('../../../hooks/use-filing', () => ({
  useFiling: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

describe('PickBookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
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
    expect(getByText('Retry')).toBeTruthy();
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

  it('back button replaces shelf when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false);

    const { getByTestId } = render(<PickBookScreen />);
    fireEvent.press(getByTestId('pick-book-back'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });
});
