import { fireEvent, render, screen } from '@testing-library/react-native';
import { IntentCard } from './IntentCard';

describe('IntentCard', () => {
  it('renders title and fires onPress', () => {
    const onPress = jest.fn();

    render(
      <IntentCard title="Learn something" onPress={onPress} testID="card" />
    );

    expect(screen.getByText('Learn something')).toBeTruthy();
    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders subtitle when provided', () => {
    render(
      <IntentCard
        title="Help with assignment?"
        subtitle="Take a picture and we'll look at it together"
        onPress={jest.fn()}
      />
    );

    expect(
      screen.getByText("Take a picture and we'll look at it together")
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
      />
    );

    expect(screen.getByTestId('card-badge')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('applies highlight styling when requested', () => {
    render(
      <IntentCard
        title="Continue where you left off"
        variant="highlight"
        onPress={jest.fn()}
        testID="card"
      />
    );

    const card = screen.getByTestId('card');
    expect(card.props.className).toContain('bg-primary-soft');
  });

  it('sets accessibility role and label', () => {
    render(
      <IntentCard title="Pick a subject" onPress={jest.fn()} testID="card" />
    );

    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Pick a subject');
  });
});
