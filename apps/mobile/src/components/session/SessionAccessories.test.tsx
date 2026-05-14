import { render, fireEvent } from '@testing-library/react-native';
import { SessionToolAccessory, HomeworkModeChips } from './SessionAccessories';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
    textSecondary: '#999',
    textInverse: '#fff',
  }),
}));

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

  it('renders Add note as the first chip when onAddNote is provided and stage is teaching', () => {
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
    expect(queryByTestId('quick-chip-park')).toBeTruthy();
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
