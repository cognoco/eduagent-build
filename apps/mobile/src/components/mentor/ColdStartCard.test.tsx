import { render, fireEvent } from '@testing-library/react-native';

import { ColdStartCard } from './ColdStartCard';

describe('ColdStartCard', () => {
  it('chips request a primary-draft fill without navigating or submitting', () => {
    const onFill = jest.fn();
    const { getByTestId } = render(<ColdStartCard onFill={onFill} />);

    fireEvent.press(getByTestId('cold-start-chip-learn'));

    expect(onFill).toHaveBeenCalledWith('Teach me something new');
  });

  it('renders starter suggestions without its own text-entry or send controls', () => {
    const { queryByTestId } = render(<ColdStartCard onFill={jest.fn()} />);

    expect(queryByTestId('cold-start-input')).toBeNull();
    expect(queryByTestId('cold-start-send')).toBeNull();
  });

  it('gives every starter a distinct accessible example-prompt name', () => {
    const { getByTestId } = render(<ColdStartCard onFill={jest.fn()} />);

    expect(
      getByTestId('cold-start-chip-homework').props.accessibilityLabel,
    ).toBe('Example prompt: Help me with homework');
    expect(getByTestId('cold-start-chip-learn').props.accessibilityLabel).toBe(
      'Example prompt: Teach me something new',
    );
    expect(getByTestId('cold-start-chip-ask').props.accessibilityLabel).toBe(
      'Example prompt: I have a question',
    );
  });

  it('shows the deterministic homework reply without a duplicate camera control', () => {
    const { getByTestId, queryByTestId, queryByText } = render(
      <ColdStartCard onFill={jest.fn()} />,
    );

    fireEvent.press(getByTestId('cold-start-chip-homework'));

    expect(getByTestId('cold-start-homework-reply')).toBeTruthy();
    expect(queryByTestId('cold-start-homework-camera')).toBeNull();
    expect(queryByText(/what subject/i)).toBeNull();
  });

  it('hides the homework reply after selecting another starter', () => {
    const { getByTestId, queryByTestId } = render(
      <ColdStartCard onFill={jest.fn()} />,
    );

    fireEvent.press(getByTestId('cold-start-chip-homework'));
    expect(getByTestId('cold-start-homework-reply')).toBeTruthy();

    fireEvent.press(getByTestId('cold-start-chip-learn'));
    expect(queryByTestId('cold-start-homework-reply')).toBeNull();
  });
});
