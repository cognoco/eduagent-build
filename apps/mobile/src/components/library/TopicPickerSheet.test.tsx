import { fireEvent, render, screen } from '@testing-library/react-native';
import { tokens } from '../../lib/design-tokens';
import type { ColorScheme } from '../../lib/design-tokens';
import { ThemeContext, type ThemeContextValue } from '../../lib/theme';
import { TopicPickerSheet } from './TopicPickerSheet';

// ---------------------------------------------------------------------------
// Test harness — wrap in an explicit ThemeContext.Provider so token-derived
// style assertions don't silently depend on the default ('light') context
// value. Each test that asserts colors parameterises the scheme so dark-mode
// regressions are caught alongside light-mode (bug #317).
// ---------------------------------------------------------------------------

function renderWithScheme(
  ui: Parameters<typeof render>[0],
  scheme: ColorScheme,
) {
  const value: ThemeContextValue = {
    colorScheme: scheme,
    setColorScheme: jest.fn(),
    accentPresetId: null,
    setAccentPresetId: jest.fn(),
  };
  return render(
    <ThemeContext.Provider value={value}>{ui}</ThemeContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const topics = [
  { topicId: 'topic-1', name: 'Algebra', chapter: 'Chapter 1' },
  { topicId: 'topic-2', name: 'Geometry', chapter: null },
  { topicId: 'topic-3', name: 'Calculus', chapter: 'Chapter 3' },
];

const defaultProps = {
  visible: true,
  topics,
  onSelect: jest.fn(),
  onClose: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Choose a topic" header when visible', () => {
    render(<TopicPickerSheet {...defaultProps} />);
    screen.getByText('Choose a topic');
  });

  it('renders topic names when visible', () => {
    render(<TopicPickerSheet {...defaultProps} />);
    screen.getByText('Algebra');
    screen.getByText('Geometry');
    screen.getByText('Calculus');
  });

  it('renders chapter labels when present', () => {
    render(<TopicPickerSheet {...defaultProps} />);
    screen.getByText('Chapter 1');
    screen.getByText('Chapter 3');
  });

  it('does not render chapter label when chapter is null', () => {
    render(<TopicPickerSheet {...defaultProps} />);
    // Geometry has no chapter — only two chapter labels should exist
    const chapterTexts = screen.queryAllByText(/Chapter/);
    expect(chapterTexts).toHaveLength(2);
  });

  it.each(['light', 'dark'] as const)(
    'highlights the default topic with the scheme-specific primarySoft background (%s)',
    (scheme) => {
      renderWithScheme(
        <TopicPickerSheet {...defaultProps} defaultTopicId="topic-2" />,
        scheme,
      );
      const selectedRow = screen.getByTestId('topic-picker-topic-2');
      expect(selectedRow.props.style).toMatchObject({
        backgroundColor: tokens[scheme].colors.primarySoft,
      });
    },
  );

  it.each(['light', 'dark'] as const)(
    'uses the scheme-specific surface background for non-selected topics (%s)',
    (scheme) => {
      renderWithScheme(
        <TopicPickerSheet {...defaultProps} defaultTopicId="topic-2" />,
        scheme,
      );
      const unselectedRow = screen.getByTestId('topic-picker-topic-1');
      expect(unselectedRow.props.style).toMatchObject({
        backgroundColor: tokens[scheme].colors.surface,
      });
    },
  );

  it('calls onSelect with topicId when a topic row is pressed', () => {
    const onSelect = jest.fn();
    render(<TopicPickerSheet {...defaultProps} onSelect={onSelect} />);

    fireEvent.press(screen.getByTestId('topic-picker-topic-3'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('topic-3');
  });

  it('names the dialog, keeps topic actions independent, and closes once from the backdrop', () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    render(
      <TopicPickerSheet
        {...defaultProps}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    const dialog = screen.getByTestId('topic-picker-modal');
    expect(dialog.props.role).toBe('dialog');
    expect(dialog.props.accessibilityLabel).toBe('Choose a topic');

    fireEvent.press(screen.getByTestId('topic-picker-topic-1'));
    expect(onSelect).toHaveBeenCalledWith('topic-1');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Close topic picker'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks selected topic with accessibilityState selected=true', () => {
    render(<TopicPickerSheet {...defaultProps} defaultTopicId="topic-1" />);
    const selectedRow = screen.getByTestId('topic-picker-topic-1');
    expect(selectedRow.props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('marks non-selected topics with accessibilityState selected=false', () => {
    render(<TopicPickerSheet {...defaultProps} defaultTopicId="topic-1" />);
    const unselectedRow = screen.getByTestId('topic-picker-topic-2');
    expect(unselectedRow.props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('does not render topic rows when visible=false', () => {
    render(<TopicPickerSheet {...defaultProps} visible={false} />);
    expect(screen.queryByTestId('topic-picker-topic-1')).toBeNull();
    expect(screen.queryByTestId('topic-picker-topic-2')).toBeNull();
    expect(screen.queryByTestId('topic-picker-topic-3')).toBeNull();
  });

  it('shows an actionable empty state when no topics are available', () => {
    const onClose = jest.fn();
    render(
      <TopicPickerSheet {...defaultProps} topics={[]} onClose={onClose} />,
    );

    screen.getByTestId('topic-picker-empty');
    expect(screen.queryByTestId('topic-picker-topic-1')).toBeNull();

    fireEvent.press(screen.getByTestId('topic-picker-empty-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('includes chapter in accessibilityLabel when present', () => {
    render(<TopicPickerSheet {...defaultProps} />);
    const rowWithChapter = screen.getByTestId('topic-picker-topic-1');
    expect(rowWithChapter.props.accessibilityLabel).toBe('Algebra, Chapter 1');
  });

  it('uses only topic name in accessibilityLabel when chapter is null', () => {
    render(<TopicPickerSheet {...defaultProps} />);
    const rowWithoutChapter = screen.getByTestId('topic-picker-topic-2');
    expect(rowWithoutChapter.props.accessibilityLabel).toBe('Geometry');
  });
});
