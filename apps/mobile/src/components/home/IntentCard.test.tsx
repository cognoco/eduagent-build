import { fireEvent, render, screen } from '@testing-library/react-native';
import { IntentCard } from './IntentCard';

describe('IntentCard', () => {
  it('renders title and fires onPress', () => {
    const onPress = jest.fn();

    render(
      <IntentCard title="Learn something" onPress={onPress} testID="card" />,
    );

    screen.getByText('Learn something');
    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders subtitle when provided', () => {
    render(
      <IntentCard
        title="Help with assignment?"
        subtitle="Take a picture and we'll look at it together"
        onPress={jest.fn()}
      />,
    );

    expect(
      screen.getByText("Take a picture and we'll look at it together"),
    ).toBeTruthy();
  });

  it('does not render subtitle element when omitted', () => {
    render(<IntentCard title="Learn" onPress={jest.fn()} testID="card" />);

    expect(screen.queryByText('Take a picture')).toBeNull();
  });

  it('renders badge when provided', () => {
    render(
      <IntentCard
        title="Repeat & review"
        badge={6}
        onPress={jest.fn()}
        testID="card"
      />,
    );

    screen.getByTestId('card-badge');
    screen.getByText('6');
  });

  it('renders icon when provided', () => {
    render(
      <IntentCard
        title="Learn"
        onPress={jest.fn()}
        icon="book-outline"
        testID="card"
      />,
    );

    expect(
      screen.getByTestId('card-icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('does not render icon element when omitted', () => {
    render(<IntentCard title="Learn" onPress={jest.fn()} testID="card" />);

    expect(screen.queryByTestId('card-icon')).toBeNull();
  });

  it('applies highlight styling when requested', () => {
    render(
      <IntentCard
        title="Continue where you left off"
        variant="highlight"
        onPress={jest.fn()}
        testID="card"
      />,
    );

    const card = screen.getByTestId('card');
    expect(card.props.className).toContain('bg-primary-soft');
  });

  it('sets accessibility role and label', () => {
    render(
      <IntentCard title="Pick a subject" onPress={jest.fn()} testID="card" />,
    );

    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Pick a subject');
  });

  it('leading icon wrapper has both a11y-hidden flags [BUG-716]', () => {
    render(
      <IntentCard
        title="Learn"
        onPress={jest.fn()}
        icon="book-outline"
        testID="card"
      />,
    );
    const iconWrapper = screen.getByTestId('card-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });

  it('chevron wrapper has both a11y-hidden flags [BUG-716]', () => {
    render(<IntentCard title="Learn" onPress={jest.fn()} testID="card" />);
    const chevron = screen.getByTestId('card-chevron', {
      includeHiddenElements: true,
    });
    expect(chevron.props.accessibilityElementsHidden).toBe(true);
    expect(chevron.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('chevron is still hidden when dismiss is also present [BUG-716]', () => {
    render(
      <IntentCard
        title="Learn"
        onPress={jest.fn()}
        onDismiss={jest.fn()}
        testID="card"
      />,
    );
    const chevron = screen.getByTestId('card-chevron', {
      includeHiddenElements: true,
    });
    expect(chevron.props.accessibilityElementsHidden).toBe(true);
    expect(chevron.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('chevron is excluded from default visible-only queries [BUG-716]', () => {
    render(<IntentCard title="Learn" onPress={jest.fn()} testID="card" />);
    expect(screen.queryByTestId('card-chevron')).toBeNull();
  });

  it('renders a dismiss action when provided and does not trigger card press', () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();

    render(
      <IntentCard
        title="Discover more"
        onPress={onPress}
        onDismiss={onDismiss}
        testID="card"
      />,
    );

    fireEvent.press(screen.getByTestId('card-dismiss'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
