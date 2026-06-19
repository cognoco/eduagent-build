import { render, fireEvent, act } from '@testing-library/react-native';
import {
  MENTOR_BIRTH_TIMINGS,
  MENTOR_BIRTH_POKE_TENTACLE_SOURCE_INDICES,
  MentorBirthAnimation,
  resolveBirthDotPosition,
} from './MentorBirthAnimation';
import { OCTO_MATE_REPAIR_PATHS } from './octo-mate-paths';

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

  it('starts the mentor node at the complete logo endpoint', () => {
    const { getByTestId } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );

    const logoMentorNode = getByTestId('mentor-birth-logo-mentor-node');

    expect(logoMentorNode.props.cx).toBe(184);
    expect(logoMentorNode.props.cy).toBe(28);
  });

  it('renders the extracted Octo Mate mascot instead of a redraw', () => {
    const { getAllByTestId } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );

    const canonicalPaths = getAllByTestId('mentor-birth-canonical-path');
    const pokeTentaclePaths = getAllByTestId('mentor-birth-poke-tentacle-path');

    expect(canonicalPaths.length + pokeTentaclePaths.length).toBe(105);
    expect(canonicalPaths.some((path) => path.props.fill === '#40A094')).toBe(
      true,
    );
    expect(canonicalPaths.some((path) => path.props.fill === '#AF80EC')).toBe(
      true,
    );
  });

  it('adds explicit repair paths for the clipped lower arm tip', () => {
    const { getAllByTestId } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );

    const repairs = getAllByTestId('mentor-birth-arm-tip-repair');

    expect(OCTO_MATE_REPAIR_PATHS).toHaveLength(2);
    expect(repairs).toHaveLength(OCTO_MATE_REPAIR_PATHS.length);
    expect(OCTO_MATE_REPAIR_PATHS.some((path) => path.d.includes('1060'))).toBe(
      true,
    );
  });

  it('uses existing extracted tentacle paths for the mint-dot poke cue', () => {
    const { getAllByTestId, queryByTestId } = render(
      <MentorBirthAnimation readyLabel="Your mentor is ready." />,
    );

    expect(queryByTestId('mentor-birth-poke-arm-outline')).toBeNull();
    expect(queryByTestId('mentor-birth-poke-arm-fill')).toBeNull();
    expect(getAllByTestId('mentor-birth-poke-tentacle-path')).toHaveLength(
      MENTOR_BIRTH_POKE_TENTACLE_SOURCE_INDICES.length,
    );
  });

  it('gives only the mint dot a post-poke bounce', () => {
    const pinkSettled = resolveBirthDotPosition(0, 1, 1, 1, 0, 0);
    const pinkDuringBounce = resolveBirthDotPosition(0, 1, 1, 1, 0.5, 0);
    const settled = resolveBirthDotPosition(2, 1, 1, 1, 0, 0);
    const bouncing = resolveBirthDotPosition(2, 1, 1, 1, 0.5, 0);
    const poked = resolveBirthDotPosition(2, 1, 1, 1, 0, 1);

    expect(pinkDuringBounce.cx).toBe(pinkSettled.cx);
    expect(pinkDuringBounce.cy).toBe(pinkSettled.cy);
    expect(settled.cx).toBe(178);
    expect(settled.cy).toBe(14);
    expect(bouncing.cy).toBeLessThan(settled.cy - 16);
    expect(poked.cx).toBeLessThan(settled.cx);
    expect(poked.rScale).toBeGreaterThan(settled.rScale);
  });

  it('keeps the poke and mint bounce slow enough to read', () => {
    expect(
      MENTOR_BIRTH_TIMINGS.pokeDrawDuration +
        MENTOR_BIRTH_TIMINGS.pokeRetractDuration,
    ).toBeGreaterThanOrEqual(650);
    expect(MENTOR_BIRTH_TIMINGS.bounceDuration).toBeGreaterThanOrEqual(900);
    expect(MENTOR_BIRTH_TIMINGS.completionDelay).toBeGreaterThan(
      MENTOR_BIRTH_TIMINGS.bounceStart + MENTOR_BIRTH_TIMINGS.bounceDuration,
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
      jest.advanceTimersByTime(6400);
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(queryByTestId('mentor-birth-animation')).not.toBeNull();

    act(() => {
      jest.runOnlyPendingTimers();
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
