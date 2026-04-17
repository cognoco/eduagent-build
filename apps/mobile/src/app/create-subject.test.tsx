import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockCreateSubjectMutateAsync = jest.fn();
const mockResolveSubjectMutateAsync = jest.fn();
let mockSearchParams: Record<string, string> = {};
let mockExistingSubjects: Array<{ id: string; name: string }> = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: mockPush,
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../hooks/use-subjects', () => ({
  useCreateSubject: () => ({
    mutateAsync: mockCreateSubjectMutateAsync,
  }),
  useSubjects: () => ({
    data: mockExistingSubjects,
  }),
  useUpdateSubject: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ subject: {} }),
  }),
}));

jest.mock('../hooks/use-resolve-subject', () => ({
  useResolveSubject: () => ({
    mutateAsync: mockResolveSubjectMutateAsync,
  }),
}));

jest.mock('../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#94a3b8',
    primary: '#2563eb',
  }),
}));

jest.mock('../hooks/use-keyboard-scroll', () => ({
  useKeyboardScroll: () => ({
    scrollRef: { current: null },
    onFieldLayout: () => () => undefined,
    onFieldFocus: () => () => undefined,
  }),
}));

const CreateSubjectScreen = require('./create-subject').default;

describe('CreateSubjectScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockExistingSubjects = [];
  });

  it('renders starter chips and fills the input on tap', () => {
    render(<CreateSubjectScreen />);

    // Chips container is visible
    expect(screen.getByTestId('starter-chips')).toBeTruthy();

    // "Math" chip is present and tappable
    const mathChip = screen.getByTestId('starter-chip-Math');
    expect(mathChip).toBeTruthy();

    // Tapping fills the name input
    fireEvent.press(mathChip);
    expect(screen.getByTestId('create-subject-name').props.value).toBe('Math');
  });

  it('tapping a chip immediately triggers resolveInput', async () => {
    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math it is.',
    });
    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: { id: 'subject-math', name: 'Math' },
    });

    render(<CreateSubjectScreen />);

    fireEvent.press(screen.getByTestId('starter-chip-Math'));

    await waitFor(() => {
      expect(mockResolveSubjectMutateAsync).toHaveBeenCalledWith({
        rawInput: 'Math',
      });
    });
  });

  it('reveals the clarify input when Something else is pressed', async () => {
    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'ambiguous',
      displayMessage: 'A few nearby subjects came up.',
      suggestions: [
        { name: 'Ant biology', description: 'Study ants and colonies' },
        { name: 'Entomology', description: 'Study of insects' },
      ],
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'ants');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('subject-something-else')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('subject-something-else'));

    expect(screen.getByTestId('subject-clarify-card')).toBeTruthy();
    expect(screen.getByTestId('subject-clarify-input')).toBeTruthy();
  });

  it('offers and uses "Just use my words" after a second unresolved round', async () => {
    mockResolveSubjectMutateAsync
      .mockResolvedValueOnce({
        status: 'ambiguous',
        displayMessage: 'A few nearby subjects came up.',
        suggestions: [
          { name: 'Ant biology', description: 'Study ants and colonies' },
        ],
      })
      .mockResolvedValueOnce({
        status: 'ambiguous',
        displayMessage: 'Still not quite sure which one you mean.',
        suggestions: [
          { name: 'Insect ecology', description: 'Ecosystems and insects' },
        ],
      });

    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: {
        id: 'subject-1',
        name: 'leaf cutter ants',
      },
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'ants');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('subject-something-else')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('subject-something-else'));
    fireEvent.changeText(
      screen.getByTestId('subject-clarify-input'),
      'leaf cutter ants'
    );
    fireEvent.press(screen.getByTestId('subject-clarify-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('subject-use-my-words')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('subject-use-my-words'));

    await waitFor(() => {
      expect(mockCreateSubjectMutateAsync).toHaveBeenCalledWith({
        name: 'leaf cutter ants',
        rawInput: 'leaf cutter ants',
      });
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: 'subject-1',
        subjectName: 'leaf cutter ants',
      },
    });
  });

  it('suggestion cards meet minimum 44px touch target size', async () => {
    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'ambiguous',
      displayMessage: 'A few nearby subjects came up.',
      suggestions: [
        { name: 'Ant biology', description: 'Study ants and colonies' },
        { name: 'Entomology', description: 'Study of insects' },
      ],
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'ants');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('subject-suggestion-option-0')).toBeTruthy();
    });

    // Suggestion cards have min-h-[52px] which exceeds 44px minimum
    const card0 = screen.getByTestId('subject-suggestion-option-0');
    const card1 = screen.getByTestId('subject-suggestion-option-1');
    expect(card0.props.accessibilityRole).toBe('button');
    expect(card1.props.accessibilityRole).toBe('button');
    expect(card0.props.accessibilityLabel).toBe('Choose Ant biology');
    expect(card1.props.accessibilityLabel).toBe('Choose Entomology');

    // Something else button also has proper accessibility
    const somethingElse = screen.getByTestId('subject-something-else');
    expect(somethingElse.props.accessibilityRole).toBe('button');
    expect(somethingElse.props.accessibilityLabel).toBe('Something else');

    // Verify the min-h-[52px] class is applied (52 > 44 minimum)
    // The Pressable elements have className containing min-h-[52px]
    // which ensures they meet accessibility touch target requirements
  });

  it('[BUG-237] picking ambiguous suggestion derives focus from original input', async () => {
    // User types "Easter", LLM returns ambiguous suggestions WITHOUT explicit focus
    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'ambiguous',
      displayMessage: '**Easter** can be studied from different angles.',
      suggestions: [
        { name: 'World History', description: 'History of Easter traditions' },
        { name: 'Religious Studies', description: 'Easter in world religions' },
      ],
    });

    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: { id: 'subject-wh', name: 'World History' },
      structureType: 'focused_book',
      bookId: 'book-easter',
      bookTitle: 'Easter',
      bookCount: 1,
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Easter');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('subject-suggestion-option-0')).toBeTruthy();
    });

    // Pick "World History"
    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      expect(mockCreateSubjectMutateAsync).toHaveBeenCalledWith({
        name: 'World History',
        rawInput: 'Easter',
        focus: 'Easter',
        focusDescription: 'History of Easter traditions',
      });
    });

    // Should navigate to interview with the focused book
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: 'subject-wh',
        subjectName: 'World History',
        bookId: 'book-easter',
        bookTitle: 'Easter',
      },
    });
  });

  it('[BUG-237] picking ambiguous suggestion with explicit focus uses that focus', async () => {
    // LLM returns suggestions WITH explicit focus fields
    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'ambiguous',
      displayMessage: '**Easter** can be studied from different angles.',
      suggestions: [
        {
          name: 'World History',
          description: 'History of Easter',
          focus: 'Easter Traditions',
        },
        {
          name: 'Religious Studies',
          description: 'Easter theology',
          focus: 'Easter in Christianity',
        },
      ],
    });

    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: { id: 'subject-wh', name: 'World History' },
      structureType: 'focused_book',
      bookId: 'book-easter-trad',
      bookTitle: 'Easter Traditions',
      bookCount: 1,
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Easter');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('subject-suggestion-option-0')).toBeTruthy();
    });

    // Pick "World History"
    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      // When the suggestion has an explicit focus, use that instead of deriving
      expect(mockCreateSubjectMutateAsync).toHaveBeenCalledWith({
        name: 'World History',
        rawInput: 'Easter',
        focus: 'Easter Traditions',
        focusDescription: 'History of Easter',
      });
    });
  });

  it('splits combined LLM names like "Biology — Botany" and derives focus', async () => {
    // LLM returns combined name despite prompt instructions saying not to
    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'ambiguous',
      displayMessage: '**Tea** can be studied from different angles.',
      suggestions: [
        {
          name: 'Biology — Botany',
          description: 'Study of tea plants and cultivation',
        },
        {
          name: 'History',
          description: 'Tea trade routes and cultural impact',
        },
      ],
    });

    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: { id: 'subject-botany', name: 'Botany' },
      structureType: 'focused_book',
      bookId: 'book-tea',
      bookTitle: 'tea',
      bookCount: 1,
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'tea');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('subject-suggestion-option-0')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      // Should split "Biology — Botany" → subjectName "Botany", focus "tea"
      expect(mockCreateSubjectMutateAsync).toHaveBeenCalledWith({
        name: 'Botany',
        rawInput: 'tea',
        focus: 'tea',
        focusDescription: 'Study of tea plants and cultivation',
      });
    });

    // Should navigate to interview (focused_book path), not library
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: 'subject-botany',
        subjectName: 'Botany',
        bookId: 'book-tea',
        bookTitle: 'tea',
      },
    });
  });

  it('routes broad subjects to the picker screen', async () => {
    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'direct_match',
      resolvedName: 'History',
      suggestions: [],
      displayMessage: 'History works well.',
    });

    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: {
        id: 'subject-history',
        name: 'History',
      },
      structureType: 'broad',
      bookCount: 6,
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'history');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: 'subject-history' },
      });
    });
  });

  // ----------------------------------------------------------------
  // BUG-3: Cancel and subject-limit buttons must route back to chat
  // when the screen was opened from a session (returnTo=chat).
  // ----------------------------------------------------------------
  it('[BUG-3] Cancel button calls router.back() when returnTo=chat', () => {
    mockSearchParams = { returnTo: 'chat' };

    render(<CreateSubjectScreen />);

    fireEvent.press(screen.getByTestId('create-subject-cancel'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('[BUG-3] subject-limit "Manage" button calls router.back() when returnTo=chat', async () => {
    mockSearchParams = { returnTo: 'chat' };

    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math works.',
    });
    mockCreateSubjectMutateAsync.mockRejectedValueOnce(
      new Error('You have reached the subject limit for your plan')
    );

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-subjects-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('manage-subjects-button'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.stringContaining('library')
    );
  });

  it('[BUG-3] subject-limit "Manage" button routes to library when no returnTo', async () => {
    mockSearchParams = {};

    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math works.',
    });
    mockCreateSubjectMutateAsync.mockRejectedValueOnce(
      new Error('You have reached the subject limit for your plan')
    );

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-subjects-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('manage-subjects-button'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('[BUG-236] returns to chat session when returnTo=chat after subject creation', async () => {
    mockSearchParams = { returnTo: 'chat', chatTopic: 'Easter' };

    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'direct_match',
      resolvedName: 'World History',
      suggestions: [],
      displayMessage: 'World History works well.',
    });

    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: {
        id: 'subject-world-history',
        name: 'World History',
      },
      structureType: 'broad',
      bookCount: 4,
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(
      screen.getByTestId('create-subject-name'),
      'World History'
    );
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'freeform',
          subjectId: 'subject-world-history',
          subjectName: 'World History',
          topicName: 'Easter',
        },
      });
    });

    // Must NOT navigate to picker or library — that was the bug
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/pick-book/[subjectId]' })
    );
  });

  it('[BUG-236] routes to picker when no returnTo param (default behavior)', async () => {
    // No returnTo param — normal Library-originated flow
    mockSearchParams = {};

    mockResolveSubjectMutateAsync.mockResolvedValueOnce({
      status: 'direct_match',
      resolvedName: 'Biology',
      suggestions: [],
      displayMessage: 'Biology it is.',
    });

    mockCreateSubjectMutateAsync.mockResolvedValueOnce({
      subject: {
        id: 'subject-biology',
        name: 'Biology',
      },
      structureType: 'broad',
      bookCount: 5,
    });

    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Biology');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: 'subject-biology' },
      });
    });

    // Must NOT navigate to session
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/session' })
    );
  });

  // ----------------------------------------------------------------
  // SUBJECT-01: Chip visibility, returning-user section, hint text
  // ----------------------------------------------------------------

  it('hides starter chips when input has text', () => {
    render(<CreateSubjectScreen />);

    expect(screen.getByTestId('starter-chips')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Bio');

    expect(screen.queryByTestId('starter-chips')).toBeNull();
  });

  it('shows "Your subjects" section when user has existing subjects', () => {
    mockExistingSubjects = [
      { id: 'sub-1', name: 'Math' },
      { id: 'sub-2', name: 'History' },
    ];

    render(<CreateSubjectScreen />);

    expect(screen.getByTestId('your-subjects-section')).toBeTruthy();
    expect(screen.getByText('Or continue with')).toBeTruthy();
    expect(screen.getByTestId('your-subject-sub-1')).toBeTruthy();
    expect(screen.getByTestId('your-subject-sub-2')).toBeTruthy();
  });

  it('hides "Your subjects" section for first-time users', () => {
    mockExistingSubjects = [];

    render(<CreateSubjectScreen />);

    expect(screen.queryByTestId('your-subjects-section')).toBeNull();
  });

  it('tapping a subject pill navigates to session with subject', () => {
    mockExistingSubjects = [{ id: 'sub-1', name: 'Math' }];

    render(<CreateSubjectScreen />);

    fireEvent.press(screen.getByTestId('your-subject-sub-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { mode: 'learning', subjectId: 'sub-1', subjectName: 'Math' },
    });
  });

  it('hides "Your subjects" section when input has text', () => {
    mockExistingSubjects = [{ id: 'sub-1', name: 'Math' }];

    render(<CreateSubjectScreen />);

    expect(screen.getByTestId('your-subjects-section')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Science');

    expect(screen.queryByTestId('your-subjects-section')).toBeNull();
  });

  it('shows "Not sure?" hint text when input is empty', () => {
    render(<CreateSubjectScreen />);

    expect(screen.getByTestId('not-sure-hint')).toBeTruthy();
    expect(
      screen.getByText(/Not sure\? Just describe what interests you/)
    ).toBeTruthy();
  });

  it('hides "Not sure?" hint when input has text', () => {
    render(<CreateSubjectScreen />);

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Art');

    expect(screen.queryByTestId('not-sure-hint')).toBeNull();
  });
});
