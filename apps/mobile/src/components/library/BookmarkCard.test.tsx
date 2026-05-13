import { fireEvent, render } from '@testing-library/react-native';
import { BookmarkCard } from './BookmarkCard';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('BookmarkCard', () => {
  it('renders saved message content and source line', () => {
    const { getByText } = render(
      <BookmarkCard
        bookmarkId="bookmark-1"
        content="Savannas are grasslands with scattered trees."
        sourceLine="From chat · May 13"
      />,
    );

    getByText('Savannas are grasslands with scattered trees.');
    getByText('From chat · May 13');
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <BookmarkCard
        bookmarkId="bookmark-1"
        content="Saved explanation"
        sourceLine="From chat · Today"
        onPress={onPress}
      />,
    );

    fireEvent.press(getByTestId('bookmark-card-bookmark-1'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
