import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SessionFooter } from './SessionFooter';

jest.mock(
  '../session' /* gc1-allow: footer tests isolate prompt/button behavior from sibling session components */,
  () => ({
    QuestionCounter: () => null,
    LibraryPrompt: () => null,
  }),
);

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
    jest.clearAllMocks();
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

  it('does not offer the note prompt when the session has no topicId', () => {
    const props = createProps({
      showFilingPrompt: false,
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
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
      undefined,
      undefined,
    );
  });

  it('uses summary-oriented placeholder for session notes', () => {
    const props = createProps({
      showFilingPrompt: false,
      notePromptOffered: true,
      showNoteInput: true,
      topicId: 'topic-1',
    });
    render(<SessionFooter {...(props as any)} />);

    expect(screen.getByTestId('note-text-input').props.placeholder).toBe(
      'What should we remember from this session?',
    );
  });

  // BUG-149: Filing failure must offer Try again as PRIMARY action and a
  // separate Skip as secondary. Previously the only option was a single
  // "Done" button that silently dismissed the prompt and navigated away —
  // a transient network failure permanently lost the session-to-book link.
  describe('BUG-149 filing-failure recovery', () => {
    it('offers Try again primary and Skip secondary when filing fails', async () => {
      const filing = {
        mutateAsync: jest
          .fn()
          // First attempt fails
          .mockRejectedValueOnce(new Error('network down')),
        isPending: false,
      };
      const props = createProps({ filing });
      render(<SessionFooter {...(props as any)} />);

      fireEvent.press(screen.getByTestId('filing-prompt-accept'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
      const labels = (buttons as Array<{ text: string }>).map((b) => b.text);
      // Primary = retry, secondary = skip (distinct, both actionable)
      expect(labels).toContain('Try again');
      expect(labels).toContain('Skip for now');
      // The old single-button "Done" path is forbidden — no auto-dismiss
      expect(labels).not.toContain('Done');
    });

    it('Try again re-invokes filing.mutateAsync (transient failure recoverable)', async () => {
      const filing = {
        mutateAsync: jest
          .fn()
          .mockRejectedValueOnce(new Error('network down'))
          .mockResolvedValueOnce({ shelfId: 'shelf-2', bookId: 'book-2' }),
        isPending: false,
      };
      const props = createProps({ filing });
      render(<SessionFooter {...(props as any)} />);

      fireEvent.press(screen.getByTestId('filing-prompt-accept'));
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // Simulate user tapping "Try again"
      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const retryBtn = buttons.find((b) => b.text === 'Try again');
      expect(retryBtn).toBeDefined();
      retryBtn?.onPress?.();

      await waitFor(() => {
        expect(filing.mutateAsync).toHaveBeenCalledTimes(2);
        // On second success, navigate WITH filed ids
        expect(props.navigateToSessionSummary).toHaveBeenCalledWith(
          'shelf-2',
          'book-2',
        );
      });
    });

    it('Skip dismisses + navigates without filed ids (only when user explicitly chooses)', async () => {
      const filing = {
        mutateAsync: jest.fn().mockRejectedValueOnce(new Error('still down')),
        isPending: false,
      };
      const props = createProps({ filing });
      render(<SessionFooter {...(props as any)} />);

      fireEvent.press(screen.getByTestId('filing-prompt-accept'));
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // No auto-navigation before the user picks a path
      expect(props.navigateToSessionSummary).not.toHaveBeenCalled();

      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const skipBtn = buttons.find((b) => b.text === 'Skip for now');
      skipBtn?.onPress?.();

      expect(props.setFilingDismissed).toHaveBeenCalledWith(true);
      expect(props.navigateToSessionSummary).toHaveBeenCalledTimes(1);
      // Skip path navigates with no filed ids (book link is intentionally lost)
      expect(props.navigateToSessionSummary).toHaveBeenCalledWith();
    });
  });
});
