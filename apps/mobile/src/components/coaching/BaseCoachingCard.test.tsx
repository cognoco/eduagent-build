import { render, screen, fireEvent } from '@testing-library/react-native';
import { BaseCoachingCard } from './BaseCoachingCard';
import { Text } from 'react-native';

describe('BaseCoachingCard', () => {
  const defaultProps = {
    headline: 'Test Headline',
    primaryLabel: 'Go',
    onPrimary: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders headline and primary button', () => {
    render(<BaseCoachingCard {...defaultProps} />);

    screen.getByText('Test Headline');
    screen.getByText('Go');
  });

  it('renders subtext when provided', () => {
    render(<BaseCoachingCard {...defaultProps} subtext="Some subtext" />);

    screen.getByText('Some subtext');
  });

  it('does not render subtext when not provided', () => {
    render(<BaseCoachingCard {...defaultProps} />);

    expect(screen.queryByText('Some subtext')).toBeNull();
  });

  it('calls onPrimary when primary button pressed', () => {
    render(<BaseCoachingCard {...defaultProps} testID="card" />);

    fireEvent.press(screen.getByTestId('card-primary'));
    expect(defaultProps.onPrimary).toHaveBeenCalledTimes(1);
  });

  it('renders secondary button when both label and handler provided', () => {
    const onSecondary = jest.fn();
    render(
      <BaseCoachingCard
        {...defaultProps}
        secondaryLabel="Skip"
        onSecondary={onSecondary}
        testID="card"
      />,
    );

    screen.getByText('Skip');
    fireEvent.press(screen.getByTestId('card-secondary'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('does not render secondary button without handler', () => {
    render(<BaseCoachingCard {...defaultProps} secondaryLabel="Skip" />);

    expect(screen.queryByText('Skip')).toBeNull();
  });

  it('renders metadata slot', () => {
    render(
      <BaseCoachingCard
        {...defaultProps}
        metadata={<Text>Custom metadata</Text>}
      />,
    );

    screen.getByText('Custom metadata');
  });

  it('renders footer slot', () => {
    render(
      <BaseCoachingCard
        {...defaultProps}
        footer={<Text>Footer content</Text>}
      />,
    );

    screen.getByText('Footer content');
  });

  it('renders skeleton when isLoading is true', () => {
    render(<BaseCoachingCard {...defaultProps} isLoading />);

    screen.getByTestId('coaching-card-skeleton');
    expect(screen.queryByText('Test Headline')).toBeNull();
  });

  it('skeleton has loading accessibility label', () => {
    render(<BaseCoachingCard {...defaultProps} isLoading />);

    screen.getByLabelText('Loading mentor card');
  });

  it('wraps in Pressable when onPress is provided', () => {
    const onPress = jest.fn();
    render(
      <BaseCoachingCard {...defaultProps} onPress={onPress} testID="card" />,
    );

    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('primary button has correct accessibility role', () => {
    render(<BaseCoachingCard {...defaultProps} testID="card" />);

    const primary = screen.getByTestId('card-primary');
    expect(primary.props.accessibilityRole).toBe('button');
  });

  // [#12] Tapping a CTA inside a pressable card must NOT also fire the card's
  // onPress. The fix stops event propagation in the CTA handler — assert both
  // that the CTA fires AND that stopPropagation is invoked on the event (this
  // is the load-bearing wiring; removing it reintroduces the web double-fire).
  it('tapping the primary CTA stops propagation and does not fire card onPress', () => {
    const onPress = jest.fn();
    const stopPropagation = jest.fn();
    render(
      <BaseCoachingCard {...defaultProps} onPress={onPress} testID="card" />,
    );

    fireEvent.press(screen.getByTestId('card-primary'), { stopPropagation });

    expect(defaultProps.onPrimary).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('tapping the secondary CTA stops propagation and does not fire card onPress', () => {
    const onPress = jest.fn();
    const onSecondary = jest.fn();
    const stopPropagation = jest.fn();
    render(
      <BaseCoachingCard
        {...defaultProps}
        onPress={onPress}
        secondaryLabel="Skip"
        onSecondary={onSecondary}
        testID="card"
      />,
    );

    fireEvent.press(screen.getByTestId('card-secondary'), { stopPropagation });

    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
