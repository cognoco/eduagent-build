import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { SessionFooter } from './SessionFooter';

jest.mock('../session', () => ({
  QuestionCounter: () => null,
  LibraryPrompt: () => null,
}));

jest.mock('../../lib/format-api-error', () => ({
  formatApiError: (e: unknown) => String(e),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
    textSecondary: '#999',
    error: '#f44',
    warning: '#ff9800',
    success: '#4caf50',
  }),
}));

jest.mock('../../hooks/use-speech-recognition', () => ({
  useSpeechRecognition: () => ({
    status: 'idle',
    transcript: '',
    isListening: false,
    startListening: jest.fn(),
    stopListening: jest.fn(),
    clearTranscript: jest.fn(),
  }),
}));

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    showFilingPrompt: true,
    filingDismissed: false,
    filing: {
      mutateAsync: jest.fn().mockResolvedValue({
        shelfId: 'shelf-1',
        bookId: 'book-1',
      }),
      isPending: false,
    },
    activeSessionId: 'session-1',
    effectiveMode: 'freeform',
    filingTopicHint: 'fractions',
    setShowFilingPrompt: jest.fn(),
    setFilingDismissed: jest.fn(),
    navigateToSessionSummary: jest.fn(),
    router: { replace: jest.fn() },
    sessionExpired: false,
    notePromptOffered: false,
    showNoteInput: false,
    setShowNoteInput: jest.fn(),
    sessionNoteSavedRef: { current: false },
    topicId: undefined,
    sessionId: undefined,
    createNote: { mutate: jest.fn(), isPending: false },
    colors: { primary: '#00b4d8' },
    userMessageCount: 0,
    showQuestionCount: false,
    showBookLink: false,
    ...overrides,
  };
}

describe('SessionFooter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows filing prompt with accept/dismiss for freeform sessions', () => {
    render(<SessionFooter {...(createProps() as any)} />);

    screen.getByTestId('filing-prompt');
    screen.getByTestId('filing-prompt-accept');
    screen.getByTestId('filing-prompt-dismiss');
  });

  it('accept button calls filing mutateAsync and continues to summary with filed ids', async () => {
    const props = createProps();
    render(<SessionFooter {...(props as any)} />);

    fireEvent.press(screen.getByTestId('filing-prompt-accept'));

    await waitFor(() => {
      expect(props.filing.mutateAsync).toHaveBeenCalledWith({
        sessionId: 'session-1',
        sessionMode: 'freeform',
      });
      expect(props.navigateToSessionSummary).toHaveBeenCalledWith(
        'shelf-1',
        'book-1',
      );
    });
  });

  it('dismiss button navigates to session summary', () => {
    const props = createProps();
    render(<SessionFooter {...(props as any)} />);

    fireEvent.press(screen.getByTestId('filing-prompt-dismiss'));

    expect(props.setFilingDismissed).toHaveBeenCalledWith(true);
    expect(props.navigateToSessionSummary).toHaveBeenCalledTimes(1);
  });

  it('note input calls createNote.mutate with topicId, content, and sessionId', () => {
    const props = createProps({
      showFilingPrompt: false,
      notePromptOffered: true,
      showNoteInput: true,
      topicId: 'topic-1',
      sessionId: 'session-1',
    });
    render(<SessionFooter {...(props as any)} />);

    fireEvent.changeText(
      screen.getByTestId('note-text-input'),
      'My note content',
    );
    fireEvent.press(screen.getByText('Save'));

    expect(props.createNote.mutate).toHaveBeenCalledWith(
      {
        topicId: 'topic-1',
        content: 'My note content',
        sessionId: 'session-1',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('passes the chat placeholder into the note composer', () => {
    const props = createProps({
      showFilingPrompt: false,
      notePromptOffered: true,
      showNoteInput: true,
      topicId: 'topic-1',
      sessionId: 'session-1',
    });
    render(<SessionFooter {...(props as any)} />);

    expect(screen.getByTestId('note-text-input').props.placeholder).toBe(
      'Summarize this in your own words...',
    );
  });
});
