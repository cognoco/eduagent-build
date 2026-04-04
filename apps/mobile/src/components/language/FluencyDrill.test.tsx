import { fireEvent, render, screen } from '@testing-library/react-native';
import { FluencyDrill } from './FluencyDrill';

describe('FluencyDrill', () => {
  it('renders prompt and timer', () => {
    render(
      <FluencyDrill
        prompt="Translate: good morning"
        expectedAnswer="buenos dias"
        onAnswer={jest.fn()}
        onTimeout={jest.fn()}
      />
    );

    expect(screen.getByText('Translate: good morning')).toBeTruthy();
    expect(screen.getByText('15s')).toBeTruthy();
  });

  it('calls onAnswer with correct flag on submit', () => {
    const onAnswer = jest.fn();
    render(
      <FluencyDrill
        prompt="Translate: house"
        expectedAnswer="casa"
        onAnswer={onAnswer}
        onTimeout={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Type your answer...');
    fireEvent.changeText(input, 'casa');
    fireEvent.press(screen.getByText('Submit'));

    expect(onAnswer).toHaveBeenCalledWith('casa', expect.any(Number), true);
  });

  it('marks incorrect answer', () => {
    const onAnswer = jest.fn();
    render(
      <FluencyDrill
        prompt="Translate: house"
        expectedAnswer="casa"
        onAnswer={onAnswer}
        onTimeout={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Type your answer...');
    fireEvent.changeText(input, 'caza');
    fireEvent.press(screen.getByText('Submit'));

    expect(onAnswer).toHaveBeenCalledWith('caza', expect.any(Number), false);
  });
});
