import { fireEvent, render } from '@testing-library/react-native';
import { BookmarkCard } from './BookmarkCard';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00b4d8',
    textPrimary: '#111',
    textSecondary: '#999',
  }),
}));

describe('BookmarkCard', () => {
  const baseProps = {
    bookmarkId: 'bm-1',
    content: 'The Calvin cycle uses CO₂ to build glucose.',
    createdAt: '2026-05-01T10:00:00Z',
    subjectName: 'Biology',
    topicTitle: 'Photosynthesis',
  };

  it('renders the content excerpt', () => {
    const { getByTestId } = render(<BookmarkCard {...baseProps} />);
    expect(getByTestId('bookmark-card-bm-1-content').props.children).toBe(
      baseProps.content,
    );
  });

  it('formats the source line with topic title when available', () => {
    const { getByTestId } = render(<BookmarkCard {...baseProps} />);
    const sourceText: string = getByTestId('bookmark-card-bm-1-source').props
      .children;
    expect(sourceText).toContain('Saved from chat');
    expect(sourceText).toContain('Photosynthesis');
  });

  it('falls back to subject name when topic title is missing', () => {
    const { getByTestId } = render(
      <BookmarkCard {...baseProps} topicTitle={null} />,
    );
    const sourceText: string = getByTestId('bookmark-card-bm-1-source').props
      .children;
    expect(sourceText).toContain('Biology');
  });

  it('omits context when both topic and subject are missing', () => {
    const { getByTestId } = render(
      <BookmarkCard {...baseProps} topicTitle={null} subjectName={null} />,
    );
    const sourceText: string = getByTestId('bookmark-card-bm-1-source').props
      .children;
    expect(sourceText).toMatch(/^Saved from chat · \w+ \d+$/);
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <BookmarkCard {...baseProps} onPress={onPress} />,
    );
    fireEvent.press(getByTestId('bookmark-card-bm-1'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses a custom testID when provided', () => {
    const { getByTestId } = render(
      <BookmarkCard {...baseProps} testID="custom-id" />,
    );
    getByTestId('custom-id');
    getByTestId('custom-id-content');
    getByTestId('custom-id-source');
  });
});
