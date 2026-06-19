import { render, fireEvent, act } from '@testing-library/react-native';
import { MentorBirthAnimation } from './MentorBirthAnimation';

beforeEach(() => {
  const reanimated = require('react-native-reanimated');
  reanimated.useReducedMotion = () => false;
  reanimated.withTiming = (value: unknown) => value;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('MentorBirthAnimation', () => {
  const completeTimingCallbacksSynchronously = () => {
    require('react-native-reanimated').withTiming = (
      value: unknown,
      _options?: unknown,
      callback?: (finished: boolean) => void,
    ) => {
      callback?.(true);
      return value;
    };
  };

  it('renders the logo-to-mentor birth beats', () => {
    const { getByTestId, getByText } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );

    getByTestId('mentor-birth-animation');
    getByTestId('mentor-birth-logo-path');
    getByTestId('mentor-birth-mentor-node');
    getByTestId('mentor-birth-mascot');
    getByText('Your mentor is ready.');
  });

  it('renders the extracted Octo Mate mascot instead of a redraw', () => {
    const { getAllByTestId } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );

    const canonicalPaths = getAllByTestId('mentor-birth-canonical-path');

    expect(canonicalPaths).toHaveLength(105);
    expect(canonicalPaths.some((path) => path.props.fill === '#40A094')).toBe(
      true,
    );
    expect(canonicalPaths.some((path) => path.props.fill === '#AF80EC')).toBe(
      true,
    );
  });

  it('calls onComplete when reduced motion is enabled', () => {
    require('react-native-reanimated').useReducedMotion = () => true;
    completeTimingCallbacksSynchronously();

    const onComplete = jest.fn();
    render(
      <MentorBirthAnimation
        readyLabel="Your mentor is ready."
        onComplete={onComplete}
      />,
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete on tap to skip', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <MentorBirthAnimation
        readyLabel="Your mentor is ready."
        onComplete={onComplete}
      />,
    );

    fireEvent.press(getByTestId('mentor-birth-animation-skip'));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('removes itself after tap to skip', () => {
    const onComplete = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <MentorBirthAnimation
        readyLabel="Your mentor is ready."
        onComplete={onComplete}
      />,
    );

    fireEvent.press(getByTestId('mentor-birth-animation-skip'));

    expect(queryByTestId('mentor-birth-animation')).toBeNull();
  });

  it('delivers completion from the watchdog when animation callbacks are dropped', () => {
    jest.useFakeTimers();

    const onComplete = jest.fn();
    const { queryByTestId } = render(
      <MentorBirthAnimation
        readyLabel="Your mentor is ready."
        onComplete={onComplete}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(5600);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(queryByTestId('mentor-birth-animation')).toBeNull();
  });

  it('keeps the final mentor frame mounted when used as an inline ready-screen animation', () => {
    jest.useFakeTimers();

    const { getByTestId } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );

    act(() => {
      jest.advanceTimersByTime(5600);
    });

    getByTestId('mentor-birth-animation');
    getByTestId('mentor-birth-mascot');
    getByTestId('mentor-birth-ready-copy');
  });

  it('cancels in-flight animations on unmount', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );
    unmount();

    expect(cancelSpy.mock.calls.length).toBeGreaterThanOrEqual(18);
    cancelSpy.mockRestore();
  });
});
