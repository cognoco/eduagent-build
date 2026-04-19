import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { SessionFooter } from './SessionFooter';

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
    depthEvaluation: null,
    depthEvaluating: false,
    onAskAnother: jest.fn(),
    onFileTopic: undefined,
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

  it('shows the evaluating skeleton while freeform depth is loading', () => {
    render(
      <SessionFooter
        {...(createProps({
          depthEvaluating: true,
        }) as any)}
      />
    );

    expect(screen.getByTestId('depth-evaluating-skeleton')).toBeTruthy();
  });

  it('shows the not-meaningful close state and supports ask another', () => {
    const props = createProps({
      depthEvaluation: {
        meaningful: false,
        reason: 'Quick Q&A',
        method: 'heuristic_shallow',
        topics: [],
      },
    });

    render(<SessionFooter {...(props as any)} />);

    expect(screen.getByTestId('not-meaningful-close')).toBeTruthy();

    fireEvent.press(screen.getByTestId('ask-another-button'));

    expect(props.setShowFilingPrompt).toHaveBeenCalledWith(false);
    expect(props.onAskAnother).toHaveBeenCalledTimes(1);
  });

  it('supports multi-topic filing for meaningful freeform sessions', async () => {
    const filing = {
      mutateAsync: jest
        .fn()
        .mockResolvedValueOnce({ shelfId: 'shelf-1', bookId: 'book-1' })
        .mockResolvedValueOnce({ shelfId: 'shelf-1', bookId: 'book-2' }),
      isPending: false,
    };
    const props = createProps({
      filing,
      depthEvaluation: {
        meaningful: true,
        reason: 'Deep session',
        method: 'heuristic_deep',
        topics: [
          { summary: 'Plant cells', depth: 'substantial' },
          { summary: 'Chlorophyll', depth: 'partial' },
        ],
      },
    });

    render(<SessionFooter {...(props as any)} />);

    expect(screen.getByTestId('multi-topic-filing')).toBeTruthy();

    fireEvent.press(screen.getByTestId('topic-chip-plant-cells'));
    fireEvent.press(screen.getByTestId('topic-chip-chlorophyll'));
    fireEvent.press(screen.getByTestId('file-selected-topics'));

    await waitFor(() => {
      expect(filing.mutateAsync).toHaveBeenCalledTimes(2);
    });

    expect(filing.mutateAsync).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-1',
      sessionMode: 'freeform',
      selectedSuggestion: 'Plant cells',
    });
    expect(filing.mutateAsync).toHaveBeenNthCalledWith(2, {
      sessionId: 'session-1',
      sessionMode: 'freeform',
      selectedSuggestion: 'Chlorophyll',
    });
    expect(props.navigateToSessionSummary).toHaveBeenCalledTimes(1);
  });
});
