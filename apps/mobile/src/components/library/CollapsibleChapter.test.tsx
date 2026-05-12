import { render, fireEvent } from '@testing-library/react-native';
import { CollapsibleChapter } from './CollapsibleChapter';

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
  useThemeColors: () => ({
    success: '#22c55e',
    textSecondary: '#6b7280',
    primary: '#0088cc',
  }),
}));

const onTopicPress = jest.fn();

const topics = [
  { id: 't1', title: 'Cell Walls', sortOrder: 1, skipped: false },
  { id: 't2', title: 'Chloroplasts', sortOrder: 2, skipped: false },
];

describe('CollapsibleChapter (Later section)', () => {
  it('renders chapter name and not-started subtitle', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Green Factories"
        topics={topics}
        totalTopicCount={5}
        chapterState="partial"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />,
    );

    getByText('Green Factories');
    getByText('2 / 5 not started');
  });

  it('shows the untouched chapter glyph', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Chapter A"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />,
    );

    getByText('○');
  });

  it('shows the partial-progress chapter glyph', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Chapter B"
        topics={topics}
        totalTopicCount={4}
        chapterState="partial"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />,
    );

    getByText('◐');
  });

  it('is collapsed by default when initiallyExpanded is false', () => {
    const { queryByText } = render(
      <CollapsibleChapter
        title="Chapter C"
        topics={topics}
        totalTopicCount={3}
        chapterState="untouched"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />,
    );

    expect(queryByText('Cell Walls')).toBeNull();
  });

  it('expands when the header is pressed', () => {
    const { getByTestId, getByText } = render(
      <CollapsibleChapter
        title="Chapter D"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded={false}
        onTopicPress={onTopicPress}
      />,
    );

    fireEvent.press(getByTestId('chapter-header-Chapter D'));
    getByText('Cell Walls');
    getByText('Chloroplasts');
  });

  it('calls onTopicPress with topic id and title', () => {
    onTopicPress.mockClear();

    const { getByText } = render(
      <CollapsibleChapter
        title="Chapter E"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded
        onTopicPress={onTopicPress}
      />,
    );

    fireEvent.press(getByText('Cell Walls'));
    expect(onTopicPress).toHaveBeenCalledWith('t1', 'Cell Walls');
  });

  it('auto-expands when initiallyExpanded is true', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="Chapter F"
        topics={topics}
        totalTopicCount={2}
        chapterState="untouched"
        initiallyExpanded
        onTopicPress={onTopicPress}
      />,
    );

    getByText('Cell Walls');
  });
});
