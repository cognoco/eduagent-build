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

    expect(screen.getByText('Test Headline')).toBeTruthy();
    expect(screen.getByText('Go')).toBeTruthy();
  });

  it('renders subtext when provided', () => {
    render(<BaseCoachingCard {...defaultProps} subtext="Some subtext" />);

    expect(screen.getByText('Some subtext')).toBeTruthy();
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
      />
    );

    expect(screen.getByText('Skip')).toBeTruthy();
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
      />
    );

    expect(screen.getByText('Custom metadata')).toBeTruthy();
  });

  it('renders footer slot', () => {
    render(
      <BaseCoachingCard
        {...defaultProps}
        footer={<Text>Footer content</Text>}
      />
    );

    expect(screen.getByText('Footer content')).toBeTruthy();
  });

  it('renders skeleton when isLoading is true', () => {
    render(<BaseCoachingCard {...defaultProps} isLoading />);

    expect(screen.getByTestId('coaching-card-skeleton')).toBeTruthy();
    expect(screen.queryByText('Test Headline')).toBeNull();
  });

  it('skeleton has loading accessibility label', () => {
    render(<BaseCoachingCard {...defaultProps} isLoading />);

    expect(screen.getByLabelText('Loading coaching card')).toBeTruthy();
  });

  it('wraps in Pressable when onPress is provided', () => {
    const onPress = jest.fn();
    render(
      <BaseCoachingCard {...defaultProps} onPress={onPress} testID="card" />
    );

    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('primary button has correct accessibility role', () => {
    render(<BaseCoachingCard {...defaultProps} testID="card" />);

    const primary = screen.getByTestId('card-primary');
    expect(primary.props.accessibilityRole).toBe('button');
  });
});
