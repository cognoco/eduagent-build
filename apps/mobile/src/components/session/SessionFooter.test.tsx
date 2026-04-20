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
    upsertNote: { mutate: jest.fn(), isPending: false },
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

    expect(screen.getByTestId('filing-prompt')).toBeTruthy();
    expect(screen.getByTestId('filing-prompt-accept')).toBeTruthy();
    expect(screen.getByTestId('filing-prompt-dismiss')).toBeTruthy();
  });

  it('accept button calls filing mutateAsync and navigates to book', async () => {
    const props = createProps();
    render(<SessionFooter {...(props as any)} />);

    fireEvent.press(screen.getByTestId('filing-prompt-accept'));

    await waitFor(() => {
      expect(props.filing.mutateAsync).toHaveBeenCalledWith({
        sessionId: 'session-1',
        sessionMode: 'freeform',
      });
      expect(props.router.replace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId: 'shelf-1', bookId: 'book-1' },
        })
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
});
