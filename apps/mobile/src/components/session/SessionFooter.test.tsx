import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SessionFooter } from './SessionFooter';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-speech-recognition' /* gc1-allow: native speech recognition is an external device boundary for NoteInput rendering */,
  () => ({
    useSpeechRecognition: () => ({
      status: 'idle',
      transcript: '',
      isListening: false,
      startListening: jest.fn(),
      stopListening: jest.fn(),
      clearTranscript: jest.fn(),
    }),
  }),
);

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    onHomeBack: jest.fn(),
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
    bookmarkableEventId: null,
    keepPending: false,
    keepSaved: false,
    onKeepNow: jest.fn(),
    ...overrides,
  };
}

describe('SessionFooter', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    // platformAlert delegates to Alert.alert on non-web platforms in Jest.
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('calls onHomeBack from the expired-session home action', () => {
    const onHomeBack = jest.fn();
    const props = createProps({ sessionExpired: true, onHomeBack });

    render(<SessionFooter {...(props as any)} />);

    fireEvent.press(screen.getByTestId('session-expired-go-home'));

    expect(onHomeBack).toHaveBeenCalledTimes(1);
  });

  it('note input calls createNote.mutate with topicId, content, and sessionId', () => {
    const props = createProps({
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

  it('does not offer the note prompt when the session has no topicId', () => {
    const props = createProps({
      notePromptOffered: true,
      topicId: undefined,
    });

    render(<SessionFooter {...(props as any)} />);

    expect(screen.queryByTestId('session-note-prompt')).toBeNull();
    expect(screen.queryByTestId('note-text-input')).toBeNull();
  });

  it('keeps the note editor open when note saving fails', () => {
    const setShowNoteInput = jest.fn();
    const createNote = {
      mutate: jest.fn(
        (_vars: unknown, options?: { onError?: (error: Error) => void }) => {
          options?.onError?.(new Error('network down'));
        },
      ),
      isPending: false,
    };
    const props = createProps({
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
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
      undefined,
      undefined,
    );
  });

  it('uses summary-oriented placeholder for session notes', () => {
    const props = createProps({
      notePromptOffered: true,
      showNoteInput: true,
      topicId: 'topic-1',
    });
    render(<SessionFooter {...(props as any)} />);

    expect(screen.getByTestId('note-text-input').props.placeholder).toBe(
      'What should we remember from this session?',
    );
  });

  it('offers a bookmark keep CTA for topicless notePrompt moments once a bookmarkable event exists', () => {
    const onKeepNow = jest.fn();
    const createNote = { mutate: jest.fn(), isPending: false };
    const props = createProps({
      notePromptOffered: true,
      topicId: undefined,
      bookmarkableEventId: 'event-1',
      onKeepNow,
      createNote,
    });
    render(<SessionFooter {...(props as any)} />);

    expect(screen.queryByTestId('session-note-prompt')).toBeNull();
    fireEvent.press(screen.getByTestId('session-freeform-keep-prompt'));

    expect(onKeepNow).toHaveBeenCalledWith('event-1');
    expect(createNote.mutate).not.toHaveBeenCalled();
  });

  it('defers the bookmark keep CTA (no error) before any bookmarkable event exists', () => {
    const props = createProps({
      notePromptOffered: true,
      topicId: undefined,
      bookmarkableEventId: null,
    });
    render(<SessionFooter {...(props as any)} />);

    expect(screen.queryByTestId('session-freeform-keep-prompt')).toBeNull();
    expect(screen.getByTestId('session-freeform-keep-deferred')).toBeTruthy();
    expect(screen.getByText('One sec…')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('hides the bookmark keep CTA once already saved', () => {
    const props = createProps({
      notePromptOffered: true,
      topicId: undefined,
      bookmarkableEventId: 'event-1',
      keepSaved: true,
    });
    render(<SessionFooter {...(props as any)} />);

    expect(screen.queryByTestId('session-freeform-keep-prompt')).toBeNull();
    expect(screen.queryByTestId('session-freeform-keep-deferred')).toBeNull();
  });

  it('does not offer the bookmark keep CTA for topic-bound sessions', () => {
    const props = createProps({
      notePromptOffered: true,
      topicId: 'topic-1',
      bookmarkableEventId: 'event-1',
    });
    render(<SessionFooter {...(props as any)} />);

    expect(screen.queryByTestId('session-freeform-keep-prompt')).toBeNull();
    expect(screen.queryByTestId('session-freeform-keep-deferred')).toBeNull();
    expect(screen.getByTestId('session-note-prompt')).toBeTruthy();
  });

  it('renders the real question counter when question count is enabled', () => {
    const props = createProps({
      showQuestionCount: true,
      userMessageCount: 3,
    });

    render(<SessionFooter {...(props as any)} />);

    expect(screen.getByTestId('question-counter')).toBeTruthy();
    expect(screen.getByLabelText('Question 3')).toBeTruthy();
  });

  it('renders the real Library prompt when the book link is enabled', () => {
    const props = createProps({ showBookLink: true });

    render(<SessionFooter {...(props as any)} />);

    fireEvent.press(screen.getByTestId('session-library-link'));

    expect(screen.getByLabelText('Go to the Library')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith('/(app)/library');
  });
});
