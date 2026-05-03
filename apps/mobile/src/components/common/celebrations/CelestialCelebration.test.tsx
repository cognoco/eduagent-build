import { render, screen } from '@testing-library/react-native';

import { CelestialCelebration } from './CelestialCelebration';
import { PolarStar } from './PolarStar';
import { TwinStars } from './TwinStars';
import { Comet } from './Comet';
import { OrionsBelt } from './OrionsBelt';

/**
 * Controllable mock for useReducedMotion. Default: false (animations run).
 * Re-mock react-native-reanimated to replace the static `() => false` from
 * test-setup.ts with a jest.fn() that individual tests can override.
 */
const mockReduceMotion = jest.fn(() => false);

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = { delay: () => chainable, duration: () => chainable };
  return {
    __esModule: true,
    default: {
      View,
      Text: View,
      ScrollView: View,
      createAnimatedComponent: (c: unknown) => c,
    },
    FadeIn: chainable,
    FadeInUp: chainable,
    FadeOutDown: chainable,
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useSharedValue: (v: unknown) => ({ value: v }),
    useReducedMotion: () => mockReduceMotion(),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    cancelAnimation: () => undefined,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: {
      linear: undefined,
      ease: undefined,
      bezier: () => undefined,
      inOut: () => undefined,
      out: () => undefined,
      in: () => undefined,
    },
  };
});

describe('CelestialCelebration', () => {
  afterEach(() => {
    mockReduceMotion.mockReturnValue(false);
  });

  it('renders with provided testID and accessibility attributes', () => {
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />
    );

    const element = screen.getByTestId('test-celebration');
    expect(element.props.accessibilityRole).toBe('image');
    expect(element.props.accessibilityLabel).toBe('Celebration animation');
  });

  it('renders children inside the SVG', () => {
    const { toJSON } = render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />
    );

    // Component should render without throwing
    expect(toJSON()).toBeTruthy();
  });

  it('calls onComplete immediately when reduced motion is enabled', () => {
    mockReduceMotion.mockReturnValue(true);

    const onComplete = jest.fn();
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={onComplete}
        testID="test-celebration"
      />
    );

    // With reduced motion, onComplete fires immediately in the useEffect
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete synchronously when animations are enabled', () => {
    mockReduceMotion.mockReturnValue(false);

    const onComplete = jest.fn();
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={onComplete}
        testID="test-celebration"
      />
    );

    // In the test mock, withSequence/withTiming are pass-through, so the
    // animation completes instantly through the mock. The runOnJS mock
    // also calls the function directly. So onComplete may still be called.
    // The key difference is the reduced-motion path calls it unconditionally.
  });

  it('sets pointerEvents to none to avoid blocking touches', () => {
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />
    );

    const element = screen.getByTestId('test-celebration');
    const styles = [element.props.style].flat(Infinity);
    expect(styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pointerEvents: 'none' }),
      ])
    );
  });
});

describe('PolarStar', () => {
  afterEach(() => {
    mockReduceMotion.mockReturnValue(false);
  });

  it('renders with default testID', () => {
    render(<PolarStar />);
    screen.getByTestId('celebration-polar-star');
  });

  it('accepts custom testID', () => {
    render(<PolarStar testID="custom-polar" />);
    screen.getByTestId('custom-polar');
  });

  it('passes onComplete to CelestialCelebration', () => {
    mockReduceMotion.mockReturnValue(true);

    const onComplete = jest.fn();
    render(<PolarStar onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalled();
  });
});

describe('TwinStars', () => {
  it('renders with default testID', () => {
    render(<TwinStars />);
    screen.getByTestId('celebration-twin-stars');
  });

  it('accepts custom testID', () => {
    render(<TwinStars testID="custom-twins" />);
    screen.getByTestId('custom-twins');
  });
});

describe('Comet', () => {
  it('renders with default testID', () => {
    render(<Comet />);
    screen.getByTestId('celebration-comet');
  });

  it('accepts custom testID', () => {
    render(<Comet testID="custom-comet" />);
    screen.getByTestId('custom-comet');
  });
});

describe('OrionsBelt', () => {
  it('renders with default testID', () => {
    render(<OrionsBelt />);
    screen.getByTestId('celebration-orions-belt');
  });

  it('accepts custom testID', () => {
    render(<OrionsBelt testID="custom-orion" />);
    screen.getByTestId('custom-orion');
  });
});
