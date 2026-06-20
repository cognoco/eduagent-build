import { render, fireEvent } from '@testing-library/react-native';
import {
  SessionToolAccessory,
  HomeworkModeChips,
  SubjectResolutionAccessory,
} from './SessionAccessories';

// prettier-ignore
jest.mock('../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
    textSecondary: '#999',
    textInverse: '#fff',
  }),
}));

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
