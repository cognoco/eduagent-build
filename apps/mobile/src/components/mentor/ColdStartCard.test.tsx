import { render, fireEvent } from '@testing-library/react-native';

import { ColdStartCard } from './ColdStartCard';

describe('ColdStartCard', () => {
  it('chips request a primary-draft fill without navigating or submitting', () => {
    const onFill = jest.fn();
    const onOpenCamera = jest.fn();
    const { getByTestId } = render(
      <ColdStartCard onFill={onFill} onOpenCamera={onOpenCamera} />,
    );

    fireEvent.press(getByTestId('cold-start-chip-learn'));

    expect(onFill).toHaveBeenCalledWith('Teach me something new');
    expect(onOpenCamera).not.toHaveBeenCalled();
  });

  it('renders starter suggestions without its own text-entry or send controls', () => {
    const { queryByTestId } = render(
      <ColdStartCard onFill={jest.fn()} onOpenCamera={jest.fn()} />,
    );

    expect(queryByTestId('cold-start-input')).toBeNull();
    expect(queryByTestId('cold-start-send')).toBeNull();
  });

  it('gives every starter a distinct accessible example-prompt name', () => {
    const { getByTestId } = render(
      <ColdStartCard onFill={jest.fn()} onOpenCamera={jest.fn()} />,
    );

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

  it('shows the deterministic homework dual-path reply with camera first', () => {
    const { getByTestId, queryByText } = render(
      <ColdStartCard onFill={jest.fn()} onOpenCamera={jest.fn()} />,
    );

    fireEvent.press(getByTestId('cold-start-chip-homework'));

    expect(
      getByTestId('cold-start-homework-camera').props.accessibilityLabel,
    ).toBe('Camera');
    expect(queryByText(/what subject/i)).toBeNull();
  });
});
