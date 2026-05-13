import { fireEvent, render } from '@testing-library/react-native';
import { BookmarkCard } from './BookmarkCard';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'library.bookmarkCard.accessibilityLabel') {
        return `Saved from chat. ${opts?.sourceLine}.`;
      }
      return key;
    },
  }),
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

  it('uses localized accessibility copy for the source line', () => {
    const { getByTestId } = render(
      <BookmarkCard
        bookmarkId="bookmark-1"
        content="Saved explanation"
        sourceLine="From chat · Today"
      />,
    );

    expect(
      getByTestId('bookmark-card-bookmark-1').props.accessibilityLabel,
    ).toBe('Saved from chat. From chat · Today.');
  });
});
