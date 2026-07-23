import { render, fireEvent } from '@testing-library/react-native';
import {
  SessionToolAccessory,
  HomeworkModeChips,
  HomeworkFirstResponseCompleteMarker,
  MentorHomeworkFirstResponse,
  SubjectResolutionAccessory,
} from './SessionAccessories';
import type { ChatMessage } from './session-types';

describe('SessionToolAccessory stage gating', () => {
  const handleQuickChip = jest.fn();

  it('renders the switch topic tool when stage is teaching', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
      />,
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeTruthy();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });

  it('renders Add note as a primary teaching action when provided', () => {
    const onAddNote = jest.fn();
    const { getByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
        onAddNote={onAddNote}
      />,
    );

    fireEvent.press(getByTestId('quick-chip-add-note'));

    expect(onAddNote).toHaveBeenCalledTimes(1);
  });

  it('disables Add note while streaming', () => {
    const { getByTestId } = render(
      <SessionToolAccessory
        isStreaming
        handleQuickChip={handleQuickChip}
        stage="teaching"
        onAddNote={jest.fn()}
      />,
    );

    expect(getByTestId('quick-chip-add-note').props.accessibilityState).toEqual(
      { disabled: true },
    );
  });

  it('renders nothing when stage is greeting', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="greeting"
      />,
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeNull();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });

  it('renders nothing when stage is orienting', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="orienting"
      />,
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeNull();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });
});

describe('SessionToolAccessory Add note chip', () => {
  const handleQuickChip = jest.fn();

  it('does not render Add note when onAddNote is omitted', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
      />,
    );
    expect(queryByTestId('quick-chip-add-note')).toBeNull();
  });

  it('renders Add note and Switch topic when provided and stage is teaching', () => {
    const onAddNote = jest.fn();
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
        onAddNote={onAddNote}
      />,
    );
    expect(queryByTestId('quick-chip-add-note')).toBeTruthy();
    expect(queryByTestId('quick-chip-switch_topic')).toBeTruthy();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });

  it('calls onAddNote when pressed', () => {
    const onAddNote = jest.fn();
    const { getByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
        onAddNote={onAddNote}
      />,
    );
    fireEvent.press(getByTestId('quick-chip-add-note'));
    expect(onAddNote).toHaveBeenCalledTimes(1);
  });

  it('is disabled while streaming', () => {
    const onAddNote = jest.fn();
    const { getByTestId } = render(
      <SessionToolAccessory
        isStreaming={true}
        handleQuickChip={handleQuickChip}
        stage="teaching"
        onAddNote={onAddNote}
      />,
    );
    const chip = getByTestId('quick-chip-add-note');
    fireEvent.press(chip);
    expect(onAddNote).not.toHaveBeenCalled();
    expect(chip.props.accessibilityState).toEqual({ disabled: true });
  });

  it('hides Add note when stage is not teaching even if onAddNote provided', () => {
    const onAddNote = jest.fn();
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="greeting"
        onAddNote={onAddNote}
      />,
    );
    expect(queryByTestId('quick-chip-add-note')).toBeNull();
  });
});

describe('SubjectResolutionAccessory typed subject override', () => {
  const baseProps = {
    pendingSubjectResolution: {
      originalText: 'tell me about the war of currents',
      prompt: "I couldn't figure out the subject. Which one fits?",
      candidates: [{ subjectId: 's1', subjectName: 'English' }],
    },
    isStreaming: false,
    pendingClassification: false,
    createSubject: { isPending: false },
    handleResolveSubject: jest.fn(),
    handleCreateSuggestedSubject: jest.fn(),
    handleCreateResolveSuggestion: jest.fn(),
    handleTypeSubject: jest.fn(),
    setPendingSubjectResolution: jest.fn(),
    router: { push: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets the learner type a subject and submit it for resolution', () => {
    const handleTypeSubject = jest.fn();
    const { getByTestId } = render(
      <SubjectResolutionAccessory
        {...(baseProps as any)}
        handleTypeSubject={handleTypeSubject}
      />,
    );

    fireEvent.changeText(
      getByTestId('subject-resolution-custom-input'),
      'fysic',
    );
    fireEvent.press(getByTestId('subject-resolution-custom-submit'));

    expect(handleTypeSubject).toHaveBeenCalledWith('fysic');
  });

  it('keeps the typed subject submit button disabled until text is entered', () => {
    const { getByTestId } = render(
      <SubjectResolutionAccessory {...(baseProps as any)} />,
    );

    expect(
      getByTestId('subject-resolution-custom-submit').props.accessibilityState,
    ).toEqual({ disabled: true });
  });

  it('puts the suggested new subject before enrolled subject candidates', () => {
    const { toJSON } = render(
      <SubjectResolutionAccessory
        {...(baseProps as any)}
        pendingSubjectResolution={{
          ...baseProps.pendingSubjectResolution,
          suggestedSubjectName: 'Philosophy',
          candidates: [
            { subjectId: 's1', subjectName: 'Business Studies' },
            { subjectId: 's2', subjectName: 'History' },
          ],
        }}
      />,
    );

    const testIds: string[] = [];
    const collectTestIds = (node: unknown) => {
      if (!node || typeof node === 'string') return;
      if (Array.isArray(node)) {
        node.forEach(collectTestIds);
        return;
      }
      const treeNode = node as {
        props?: { testID?: unknown };
        children?: unknown;
      };
      if (typeof treeNode.props?.testID === 'string') {
        testIds.push(treeNode.props.testID);
      }
      collectTestIds(treeNode.children);
    };
    collectTestIds(toJSON());

    const scrollIndex = testIds.indexOf('session-subject-resolution');
    expect(scrollIndex).toBeGreaterThanOrEqual(0);
    expect(testIds.slice(scrollIndex + 1, scrollIndex + 4)).toEqual([
      'subject-resolution-create-suggested',
      'subject-resolution-s1',
      'subject-resolution-s2',
    ]);
  });

  it('offers the suggested new subject even when there are no candidates', () => {
    const handleCreateSuggestedSubject = jest.fn();
    const { getByTestId, getByText } = render(
      <SubjectResolutionAccessory
        {...(baseProps as any)}
        pendingSubjectResolution={{
          ...baseProps.pendingSubjectResolution,
          suggestedSubjectName: 'Philosophy',
          candidates: [],
        }}
        handleCreateSuggestedSubject={handleCreateSuggestedSubject}
      />,
    );

    getByText('+ Philosophy');
    fireEvent.press(getByTestId('subject-resolution-create-suggested'));

    expect(handleCreateSuggestedSubject).toHaveBeenCalledTimes(1);
  });

  it('keeps the zero-candidate create-new selector unique from suggested creates', () => {
    const { queryAllByTestId } = render(
      <SubjectResolutionAccessory
        {...(baseProps as any)}
        pendingSubjectResolution={{
          ...baseProps.pendingSubjectResolution,
          suggestedSubjectName: 'Philosophy',
          candidates: [],
        }}
      />,
    );

    expect(queryAllByTestId('subject-resolution-create-new')).toHaveLength(0);
    expect(
      queryAllByTestId('subject-resolution-create-suggested'),
    ).toHaveLength(1);
  });
});

// M6: Zero-problems homework fallback must have an escape action
describe('HomeworkModeChips M6: zero-problems fallback action', () => {
  const baseProps = {
    effectiveMode: 'homework',
    homeworkProblemsState: [],
    currentProblemIndex: 0,
    activeHomeworkProblem: undefined,
    homeworkMode: undefined,
    setHomeworkMode: jest.fn(),
    handleNextProblem: jest.fn(),
    handleEndSession: jest.fn(),
  };

  it('shows End session button when no problems are loaded [M6]', () => {
    const { getByTestId } = render(<HomeworkModeChips {...baseProps} />);
    getByTestId('homework-no-problems');
    getByTestId('homework-no-problems-end-btn');
  });

  it('End session button calls handleEndSession [M6]', () => {
    const handleEndSession = jest.fn();
    const { getByTestId } = render(
      <HomeworkModeChips {...baseProps} handleEndSession={handleEndSession} />,
    );
    fireEvent.press(getByTestId('homework-no-problems-end-btn'));
    expect(handleEndSession).toHaveBeenCalledTimes(1);
  });
});

describe('HomeworkModeChips problem text', () => {
  it('shows the complete expanded homework problem instead of a hard slice', () => {
    const longProblem =
      'A very long homework prompt that asks the learner to compare two equations, explain each step, and then decide which expression is equivalent.';

    const { getByTestId } = render(
      <HomeworkModeChips
        effectiveMode="homework"
        homeworkProblemsState={[{ text: longProblem } as any]}
        currentProblemIndex={0}
        activeHomeworkProblem={{ text: longProblem } as any}
        homeworkMode={undefined}
        setHomeworkMode={jest.fn()}
        handleNextProblem={jest.fn()}
        handleEndSession={jest.fn()}
      />,
    );

    expect(getByTestId('homework-problem-text').props.children).toBe(
      longProblem,
    );
  });
});

describe('MentorHomeworkFirstResponse learner media association', () => {
  it('renders the captured image as the sole learner media bubble', () => {
    const imageUri = 'data:image/jpeg;base64,xxx';

    const { getByTestId, queryByTestId } = render(
      <MentorHomeworkFirstResponse
        imageUri={imageUri}
        problemText={undefined}
        disabled={false}
        onHelpMeSolve={jest.fn()}
        onCheckMyAnswer={jest.fn()}
      />,
    );

    getByTestId('homework-image-bubble');
    expect(queryByTestId('homework-problem-text-bubble')).toBeNull();
  });

  it('renders the entered manual problem as the learner bubble instead of an empty image placeholder', () => {
    const problemText = 'Solve 3x + 7 = 22';

    const { getByTestId, queryByTestId } = render(
      <MentorHomeworkFirstResponse
        imageUri={undefined}
        problemText={problemText}
        disabled={false}
        onHelpMeSolve={jest.fn()}
        onCheckMyAnswer={jest.fn()}
      />,
    );

    expect(getByTestId('homework-problem-text-bubble').props.children).toBe(
      problemText,
    );
    expect(queryByTestId('homework-image-bubble')).toBeNull();
  });

  it('renders no media bubble when neither an image nor a problem is associated', () => {
    const { queryByTestId } = render(
      <MentorHomeworkFirstResponse
        imageUri={undefined}
        problemText={undefined}
        disabled={false}
        onHelpMeSolve={jest.fn()}
        onCheckMyAnswer={jest.fn()}
      />,
    );

    expect(queryByTestId('homework-image-bubble')).toBeNull();
    expect(queryByTestId('homework-problem-text-bubble')).toBeNull();
    expect(queryByTestId('homework-problem-text-bubble-container')).toBeNull();
  });
});

describe('HomeworkFirstResponseCompleteMarker', () => {
  const problemText = 'Solve 3x + 7 = 22';
  const openingMessage = {
    id: 'opening',
    role: 'assistant' as const,
    content: 'What are you working on?',
  };
  const homeworkMessage = {
    id: 'homework-problem',
    role: 'user' as const,
    content: problemText,
    isAutoSent: true,
  };

  it('does not read messages when the E2E marker is inactive', () => {
    const messages = new Proxy([] as ChatMessage[], {
      get() {
        throw new Error('inactive marker read its messages');
      },
    });

    const { queryByTestId } = render(
      <HomeworkFirstResponseCompleteMarker
        active={false}
        problemText={problemText}
        isStreaming={false}
        hasFailure={false}
        messages={messages}
      />,
    );

    expect(queryByTestId('homework-first-response-complete')).toBeNull();
  });

  it('does not mark empty content, a thinking placeholder, or a partial stream as completed', () => {
    const { queryByTestId, rerender } = render(
      <HomeworkFirstResponseCompleteMarker
        active
        problemText={problemText}
        isStreaming={false}
        hasFailure={false}
        messages={[
          openingMessage,
          homeworkMessage,
          {
            id: 'empty-reply',
            role: 'assistant',
            content: '',
            streaming: false,
          },
        ]}
      />,
    );

    expect(queryByTestId('homework-first-response-complete')).toBeNull();

    rerender(
      <HomeworkFirstResponseCompleteMarker
        active
        problemText={problemText}
        isStreaming
        hasFailure={false}
        messages={[
          openingMessage,
          homeworkMessage,
          {
            id: 'partial-reply',
            role: 'assistant',
            content: 'Let us',
            streaming: true,
          },
        ]}
      />,
    );

    expect(queryByTestId('homework-first-response-complete')).toBeNull();
  });

  it('marks only a non-empty completed genuine reply with no reconnect or fallback message', () => {
    const completedReply = {
      id: 'completed-reply',
      role: 'assistant' as const,
      content: 'First, subtract 7 from both sides.',
      streaming: false,
      eventId: 'ai-event-homework-first-reply',
    };
    const { getByTestId, queryByTestId, rerender } = render(
      <HomeworkFirstResponseCompleteMarker
        active
        problemText={problemText}
        isStreaming={false}
        hasFailure={false}
        messages={[
          openingMessage,
          homeworkMessage,
          {
            id: 'fallback',
            role: 'assistant',
            content: 'Try again later.',
            isSystemPrompt: true,
          },
        ]}
      />,
    );

    expect(queryByTestId('homework-first-response-complete')).toBeNull();

    rerender(
      <HomeworkFirstResponseCompleteMarker
        active
        problemText={problemText}
        isStreaming={false}
        hasFailure={false}
        messages={[openingMessage, homeworkMessage, completedReply]}
      />,
    );

    getByTestId('homework-first-response-complete');

    rerender(
      <HomeworkFirstResponseCompleteMarker
        active
        problemText={problemText}
        isStreaming={false}
        hasFailure={false}
        messages={[
          openingMessage,
          homeworkMessage,
          completedReply,
          {
            id: 'reconnect',
            role: 'assistant',
            content: 'Reconnect to continue.',
            kind: 'reconnect_prompt',
          },
        ]}
      />,
    );

    expect(queryByTestId('homework-first-response-complete')).toBeNull();
  });

  it('requires an assistant eventId before marking the first response complete', () => {
    const fatalErrorReply = {
      id: 'fatal-error',
      role: 'assistant' as const,
      content: 'That request could not be processed.',
      streaming: false,
      kind: undefined,
      isSystemPrompt: false,
    };
    const { getByTestId, queryByTestId, rerender } = render(
      <HomeworkFirstResponseCompleteMarker
        active
        problemText={problemText}
        isStreaming={false}
        hasFailure={false}
        messages={[openingMessage, homeworkMessage, fatalErrorReply]}
      />,
    );

    expect(queryByTestId('homework-first-response-complete')).toBeNull();

    rerender(
      <HomeworkFirstResponseCompleteMarker
        active
        problemText={problemText}
        isStreaming={false}
        hasFailure={false}
        messages={[
          openingMessage,
          homeworkMessage,
          {
            ...fatalErrorReply,
            id: 'successful-reply',
            content: 'First, subtract 7 from both sides.',
            eventId: 'ai-event-homework-first-reply',
          },
        ]}
      />,
    );

    getByTestId('homework-first-response-complete');
  });
});
