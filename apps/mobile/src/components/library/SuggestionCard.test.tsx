import { fireEvent, render, screen } from '@testing-library/react-native';
import { SuggestionCard } from './SuggestionCard';

describe('SuggestionCard', () => {
  it('renders title and emoji', () => {
    render(<SuggestionCard title="Oceans" emoji="🌊" onPress={jest.fn()} />);
    screen.getByText('Oceans');
    screen.getByText('🌊');
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<SuggestionCard title="Oceans" emoji="🌊" onPress={onPress} />);
    fireEvent.press(screen.getByText('Oceans'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without emoji', () => {
    render(<SuggestionCard title="Mountains" onPress={jest.fn()} />);
    screen.getByText('Mountains');
  });

  it('renders with null emoji gracefully', () => {
    render(
      <SuggestionCard title="Volcanoes" emoji={null} onPress={jest.fn()} />,
    );
    screen.getByText('Volcanoes');
  });

  it('renders description when provided', () => {
    render(
      <SuggestionCard
        title="Rivers"
        description="Learn about major rivers"
        onPress={jest.fn()}
      />,
    );
    screen.getByText('Rivers');
    screen.getByText('Learn about major rivers');
  });

  it('applies testID when provided', () => {
    render(
      <SuggestionCard
        title="Forests"
        onPress={jest.fn()}
        testID="suggestion-forests"
      />,
    );
    screen.getByTestId('suggestion-forests');
  });

  it('uses subject tint for suggested books when provided', () => {
    render(
      <SuggestionCard
        title="Forests"
        onPress={jest.fn()}
        testID="suggestion-forests"
        tint={{
          name: 'emerald',
          solid: '#047857',
          soft: 'rgba(4,120,87,0.14)',
        }}
      />,
    );

    const card = screen.getByTestId('suggestion-forests');
    expect(card.props.style).toEqual(
      expect.objectContaining({
        borderColor: '#047857',
        backgroundColor: 'rgba(4,120,87,0.14)',
      }),
    );
  });
});
