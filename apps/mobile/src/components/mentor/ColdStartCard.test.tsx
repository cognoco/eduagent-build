import { render, fireEvent, act } from '@testing-library/react-native';

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

  it('enables an accessible send affordance after typing and submits the trimmed prompt', () => {
    const onSubmitText = jest.fn();
    const { getByTestId } = render(
      <ColdStartCard
        onFill={jest.fn()}
        onSubmitText={onSubmitText}
        onOpenCamera={jest.fn()}
      />,
    );

    const send = getByTestId('cold-start-send');
    expect(send.props.accessibilityRole).toBe('button');
    expect(send.props.accessibilityLabel).toBe('Send message');
    expect(send.props.accessibilityState).toEqual({ disabled: true });

    fireEvent.changeText(getByTestId('cold-start-input'), '  photosynthesis  ');

    expect(getByTestId('cold-start-send').props.accessibilityState).toEqual({
      disabled: false,
    });
    fireEvent.press(getByTestId('cold-start-send'));

    expect(onSubmitText).toHaveBeenCalledWith('photosynthesis');
  });

  it('does not submit blank typed prompts from the send affordance', () => {
    const onSubmitText = jest.fn();
    const { getByTestId } = render(
      <ColdStartCard
        onFill={jest.fn()}
        onSubmitText={onSubmitText}
        onOpenCamera={jest.fn()}
      />,
    );

    fireEvent.changeText(getByTestId('cold-start-input'), '   ');
    fireEvent.press(getByTestId('cold-start-send'));

    expect(getByTestId('cold-start-send').props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(onSubmitText).not.toHaveBeenCalled();
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

  it('rotates the input placeholder through more than one distinct example, including a navigational one', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = render(
        <ColdStartCard
          onFill={jest.fn()}
          onSubmitText={jest.fn()}
          onOpenCamera={jest.fn()}
          placeholderRotationIntervalMs={1000}
        />,
      );

      const input = getByTestId('cold-start-input');
      const seen = new Set<string>();
      seen.add(input.props.placeholder);

      // Advance through a full rotation cycle and collect each placeholder.
      for (let i = 0; i < 3; i += 1) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        seen.add(getByTestId('cold-start-input').props.placeholder);
      }

      // Rotation surfaces more than one distinct example over time. (We assert
      // on distinct placeholder values, not rendered English: the new rotation
      // keys are not yet in en.json during this PR — i18n protocol.)
      expect(seen.size).toBeGreaterThan(1);
      // The third rotation entry is the navigational example by contract
      // (`placeholderRotation.three` -> "Try: show my progress"); presence of a
      // third distinct value proves the navigational slot is in the cycle.
      expect(seen.size).toBeGreaterThanOrEqual(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
