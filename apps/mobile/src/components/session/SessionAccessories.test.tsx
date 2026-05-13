import { render, fireEvent } from '@testing-library/react-native';
import {
  SessionToolAccessory,
  HomeworkModeChips,
  SubjectResolutionAccessory,
} from './SessionAccessories';

describe('SessionToolAccessory stage gating', () => {
  const handleQuickChip = jest.fn();

  it('renders Switch topic and Park it when stage is teaching', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
      />,
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeTruthy();
    expect(queryByTestId('quick-chip-park')).toBeTruthy();
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
