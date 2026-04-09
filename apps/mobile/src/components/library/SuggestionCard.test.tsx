import { fireEvent, render, screen } from '@testing-library/react-native';
import { SuggestionCard } from './SuggestionCard';

describe('SuggestionCard', () => {
  it('renders title and emoji', () => {
    render(<SuggestionCard title="Oceans" emoji="🌊" onPress={jest.fn()} />);
    expect(screen.getByText('Oceans')).toBeTruthy();
    expect(screen.getByText('🌊')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<SuggestionCard title="Oceans" emoji="🌊" onPress={onPress} />);
    fireEvent.press(screen.getByText('Oceans'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without emoji', () => {
    render(<SuggestionCard title="Mountains" onPress={jest.fn()} />);
    expect(screen.getByText('Mountains')).toBeTruthy();
  });

  it('renders with null emoji gracefully', () => {
    render(
      <SuggestionCard title="Volcanoes" emoji={null} onPress={jest.fn()} />
    );
    expect(screen.getByText('Volcanoes')).toBeTruthy();
  });

  it('renders description when provided', () => {
    render(
      <SuggestionCard
        title="Rivers"
        description="Learn about major rivers"
        onPress={jest.fn()}
      />
    );
    expect(screen.getByText('Rivers')).toBeTruthy();
    expect(screen.getByText('Learn about major rivers')).toBeTruthy();
  });

  it('applies testID when provided', () => {
    render(
      <SuggestionCard
        title="Forests"
        onPress={jest.fn()}
        testID="suggestion-forests"
      />
    );
    expect(screen.getByTestId('suggestion-forests')).toBeTruthy();
  });
});
