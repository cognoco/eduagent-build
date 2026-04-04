import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCreateSubjectMutateAsync = jest.fn();
const mockResolveSubjectMutateAsync = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../hooks/use-subjects', () => ({
  useCreateSubject: () => ({
    mutateAsync: mockCreateSubjectMutateAsync,
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
      pathname: '/(learner)/onboarding/interview',
      params: {
        subjectId: 'subject-1',
        subjectName: 'leaf cutter ants',
      },
    });
  });

  it('routes broad subjects straight to the library shelf', async () => {
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
        pathname: '/(learner)/library',
        params: { subjectId: 'subject-history' },
      });
    });
  });
});
