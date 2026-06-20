import { render, fireEvent } from '@testing-library/react-native';

import { MentorInputBar } from './MentorInputBar';

describe('MentorInputBar', () => {
  it('fires camera and homework callbacks', () => {
    const onOpenCamera = jest.fn();
    const onOpenHomework = jest.fn();
    const { getByTestId } = render(
      <MentorInputBar
        onSubmitText={jest.fn()}
        onOpenCamera={onOpenCamera}
        onOpenHomework={onOpenHomework}
        onTranscript={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('mentor-bar-camera'));
    fireEvent.press(getByTestId('mentor-bar-homework-chip'));

    expect(onOpenCamera).toHaveBeenCalledTimes(1);
    expect(onOpenHomework).toHaveBeenCalledTimes(1);
  });

  it('submits typed text and transcribes string-only voice input', () => {
    const onSubmitText = jest.fn();
    const onTranscript = jest.fn();
    const { getByTestId } = render(
      <MentorInputBar
        onSubmitText={onSubmitText}
        onOpenCamera={jest.fn()}
        onOpenHomework={jest.fn()}
        onTranscript={onTranscript}
      />,
    );

    fireEvent.changeText(getByTestId('mentor-bar-input'), 'show topic');
    fireEvent(getByTestId('mentor-bar-input'), 'submitEditing');
    fireEvent.press(getByTestId('mentor-bar-mic'));

    expect(onSubmitText).toHaveBeenCalledWith('show topic');
    expect(onTranscript).toHaveBeenCalledWith('show topic');
    expect(typeof onTranscript.mock.calls[0]?.[0]).toBe('string');
  });

  it('keeps deterministic submit and non-LLM affordances live when unavailable', () => {
    const onSubmitText = jest.fn();
    const onOpenCamera = jest.fn();
    const onOpenHomework = jest.fn();
    const onTranscript = jest.fn();
    const { getByTestId, getByText } = render(
      <MentorInputBar
        unavailable
        onSubmitText={onSubmitText}
        onOpenCamera={onOpenCamera}
        onOpenHomework={onOpenHomework}
        onTranscript={onTranscript}
      />,
    );

    expect(
      getByText('The mentor is offline for a moment. You can still type.'),
    ).toBeTruthy();
    fireEvent.changeText(getByTestId('mentor-bar-input'), 'continue session-1');
    fireEvent(getByTestId('mentor-bar-input'), 'submitEditing');
    fireEvent.press(getByTestId('mentor-bar-camera'));
    fireEvent.press(getByTestId('mentor-bar-homework-chip'));
    fireEvent.press(getByTestId('mentor-bar-mic'));

    expect(onSubmitText).toHaveBeenCalledWith('continue session-1');
    expect(onOpenCamera).toHaveBeenCalledTimes(1);
    expect(onOpenHomework).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith('continue session-1');
  });
});
