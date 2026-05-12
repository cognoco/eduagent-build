import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SessionFooter } from './SessionFooter';

jest.mock('../session', () => ({
  // gc1-allow: footer tests isolate prompt/button behavior from sibling session components
  QuestionCounter: () => null,
  LibraryPrompt: () => null,
}));

jest.mock('../../lib/format-api-error', () => ({
  // gc1-allow: error formatting is covered separately; this test asserts footer recovery behavior
  formatApiError: (e: unknown) => String(e),
}));

jest.mock('../../hooks/use-speech-recognition', () => ({
  // gc1-allow: native speech recognition is an external device boundary for NoteInput rendering
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
    jest.restoreAllMocks();
    // platformAlert delegates to Alert.alert on non-web platforms in Jest.
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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

  it('keeps the note editor open when note saving fails', () => {
    const setShowNoteInput = jest.fn();
    const createNote = {
      mutate: jest.fn((...args: unknown[]) => {
        const options = args[1] as { onError: (error: Error) => void };
        options.onError(new Error('network down'));
      }),
      isPending: false,
    };
    const props = createProps({
      showFilingPrompt: false,
      notePromptOffered: true,
      showNoteInput: true,
      setShowNoteInput,
      topicId: 'topic-1',
      sessionId: 'session-1',
      createNote,
    });
    render(<SessionFooter {...(props as any)} />);

    fireEvent.changeText(
      screen.getByTestId('note-text-input'),
      'This took a while to write',
    );
    fireEvent.press(screen.getByText('Save'));

    expect(setShowNoteInput).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-text-input').props.value).toBe(
      'This took a while to write',
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not save note',
      'Error: network down',
      undefined,
      undefined,
    );
  });
});
