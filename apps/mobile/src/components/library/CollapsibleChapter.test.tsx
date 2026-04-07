import { render, fireEvent } from '@testing-library/react-native';
import { CollapsibleChapter } from './CollapsibleChapter';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textSecondary: '#999',
    success: '#0f0',
    primary: '#00bcd4',
  }),
}));

jest.mock('../progress/RetentionSignal', () => ({
  RetentionSignal: () => null,
}));

const mockTopics = [
  { id: 'topic-1', title: 'The Nile', sortOrder: 0, skipped: false },
  { id: 'topic-2', title: 'Geography', sortOrder: 1, skipped: false },
  { id: 'topic-3', title: 'Climate', sortOrder: 2, skipped: true },
];

describe('CollapsibleChapter', () => {
  it('renders chapter header with title and count', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={1}
        initiallyExpanded
        onTopicPress={jest.fn()}
      />
    );
    expect(getByText(/The Land/)).toBeTruthy();
    expect(getByText(/1\/3/)).toBeTruthy();
  });

  it('shows topics when expanded', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded
        onTopicPress={jest.fn()}
      />
    );
    expect(getByText('The Nile')).toBeTruthy();
    expect(getByText('Geography')).toBeTruthy();
  });

  it('hides topics when collapsed', () => {
    const { queryByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded={false}
        onTopicPress={jest.fn()}
      />
    );
    expect(queryByText('The Nile')).toBeNull();
  });

  it('toggles on header press', () => {
    const { getByTestId, queryByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded={false}
        onTopicPress={jest.fn()}
      />
    );
    fireEvent.press(getByTestId('chapter-header-The Land'));
    expect(queryByText('The Nile')).toBeTruthy();
  });

  it('calls onTopicPress with topic id', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded
        onTopicPress={onPress}
      />
    );
    fireEvent.press(getByText('The Nile'));
    expect(onPress).toHaveBeenCalledWith('topic-1', 'The Nile');
  });

  it('shows note icon when topic has a note', () => {
    const { getByTestId } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded
        onTopicPress={jest.fn()}
        noteTopicIds={new Set(['topic-1'])}
        onNotePress={jest.fn()}
      />
    );
    expect(getByTestId('note-icon-topic-1')).toBeTruthy();
  });
});
