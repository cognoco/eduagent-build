import { render, fireEvent } from '@testing-library/react-native';
import { SessionRow } from './SessionRow';

describe('SessionRow', () => {
  const baseProps = {
    emoji: '☕',
    title: 'Tea & caffeine',
    relativeDate: '2d',
    hasNote: true,
    onPress: jest.fn(),
    onLongPress: jest.fn(),
  };

  it('renders title and emoji', () => {
    const { getByText } = render(<SessionRow {...baseProps} />);
    getByText('Tea & caffeine');
    getByText('☕');
  });

  it('shows note indicator when hasNote is true', () => {
    const { getByTestId } = render(<SessionRow {...baseProps} />);
    getByTestId('session-note-indicator');
  });

  it('hides note indicator when hasNote is false', () => {
    const { queryByTestId } = render(
      <SessionRow {...baseProps} hasNote={false} />
    );
    expect(queryByTestId('session-note-indicator')).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <SessionRow {...baseProps} onPress={onPress} testID="session-row" />
    );
    fireEvent.press(getByTestId('session-row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onLongPress on long press', () => {
    const onLongPress = jest.fn();
    const { getByTestId } = render(
      <SessionRow
        {...baseProps}
        onLongPress={onLongPress}
        testID="session-row"
      />
    );
    fireEvent(getByTestId('session-row'), 'onLongPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('renders fallback emoji when emoji is null', () => {
    const { getByText } = render(<SessionRow {...baseProps} emoji={null} />);
    getByText('📖');
  });

  it('renders relative date', () => {
    const { getByText } = render(<SessionRow {...baseProps} />);
    getByText('2d');
  });
});
