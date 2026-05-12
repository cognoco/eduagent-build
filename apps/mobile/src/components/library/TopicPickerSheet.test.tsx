import { fireEvent, render, screen } from '@testing-library/react-native';
import { TopicPickerSheet } from './TopicPickerSheet';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    primarySoft: '#d1fae5',
    surface: '#f5f0e8',
    textPrimary: '#1a1a1a',
    textSecondary: '#525252',
  }),
}));

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

  it('highlights the default topic with primarySoft background', () => {
    render(<TopicPickerSheet {...defaultProps} defaultTopicId="topic-2" />);
    const selectedRow = screen.getByTestId('topic-picker-topic-2');
    expect(selectedRow.props.style).toMatchObject({
      backgroundColor: '#d1fae5',
    });
  });

  it('uses surface background for non-selected topics', () => {
    render(<TopicPickerSheet {...defaultProps} defaultTopicId="topic-2" />);
    const unselectedRow = screen.getByTestId('topic-picker-topic-1');
    expect(unselectedRow.props.style).toMatchObject({
      backgroundColor: '#f5f0e8',
    });
  });

  it('calls onSelect with topicId when a topic row is pressed', () => {
    const onSelect = jest.fn();
    render(<TopicPickerSheet {...defaultProps} onSelect={onSelect} />);

    fireEvent.press(screen.getByTestId('topic-picker-topic-3'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('topic-3');
  });

  it('calls onClose when backdrop is pressed', () => {
    const onClose = jest.fn();
    render(<TopicPickerSheet {...defaultProps} onClose={onClose} />);

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
