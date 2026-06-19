import { render, fireEvent } from '@testing-library/react-native';

import { ColdStartCard } from './ColdStartCard';

describe('ColdStartCard', () => {
  it('chips fill the input without navigating or submitting', () => {
    const onFill = jest.fn();
    const onSubmitText = jest.fn();
    const onOpenCamera = jest.fn();
    const { getByTestId } = render(
      <ColdStartCard
        onFill={onFill}
        onSubmitText={onSubmitText}
        onOpenCamera={onOpenCamera}
      />,
    );

    fireEvent.press(getByTestId('cold-start-chip-learn'));

    expect(onFill).toHaveBeenCalledWith('Teach me something new');
    expect(onSubmitText).not.toHaveBeenCalled();
    expect(onOpenCamera).not.toHaveBeenCalled();
  });

  it('uses the same equal-weight token for the input and all chips', () => {
    const { getByTestId } = render(
      <ColdStartCard
        onFill={jest.fn()}
        onSubmitText={jest.fn()}
        onOpenCamera={jest.fn()}
      />,
    );

    const token = getByTestId('cold-start-input').props.accessibilityLabel;
    expect(
      getByTestId('cold-start-chip-homework').props.accessibilityLabel,
    ).toBe(token);
    expect(getByTestId('cold-start-chip-learn').props.accessibilityLabel).toBe(
      token,
    );
    expect(getByTestId('cold-start-chip-ask').props.accessibilityLabel).toBe(
      token,
    );
  });

  it('shows the deterministic homework dual-path reply with camera first', () => {
    const { getByTestId, queryByText } = render(
      <ColdStartCard
        onFill={jest.fn()}
        onSubmitText={jest.fn()}
        onOpenCamera={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('cold-start-chip-homework'));

    expect(getByTestId('cold-start-homework-camera')).toBeTruthy();
    expect(queryByText(/what subject/i)).toBeNull();
  });
});
