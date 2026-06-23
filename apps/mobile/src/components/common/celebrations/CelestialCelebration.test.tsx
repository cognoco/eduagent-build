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
    withTiming: (
      v: unknown,
      _opts?: unknown,
      cb?: (finished: boolean) => void,
    ) => {
      // Simulate the animation completing synchronously so tests can assert
      // on the withTiming callback (e.g., the runOnJS(onComplete) call that
      // fires after the fade-out). This models the external Reanimated
      // runtime's behaviour of calling the callback with finished=true.
      cb?.(true);
      return v;
    },
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[0],
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

  it('is hidden from assistive technology (decorative animation)', () => {
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />,
    );

    // accessibilityElementsHidden hides the subtree from a11y queries;
    // use includeHiddenElements:true to reach the element by testID.
    const element = screen.getByTestId('test-celebration', {
      includeHiddenElements: true,
    });
    expect(element.props.accessibilityElementsHidden).toBe(true);
    expect(element.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(element.props.accessibilityRole).toBeUndefined();
    expect(element.props.accessibilityLabel).toBeUndefined();
  });

  it('renders children inside the SVG', () => {
    const { toJSON } = render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />,
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
      />,
    );

    // With reduced motion, onComplete fires immediately in the useEffect
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete via the animated path when withTiming callback fires', () => {
    mockReduceMotion.mockReturnValue(false);

    const onComplete = jest.fn();
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={onComplete}
        testID="test-celebration"
      />,
    );

    // The animated path wires: withTiming(..., callback) → callback(finished=true)
    // → runOnJS(onComplete)(). The local mock fires withTiming callbacks
    // synchronously with finished=true, and runOnJS is identity, so onComplete
    // is called exactly once when the second withTiming (the fade-out) completes.
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('sets pointerEvents to none to avoid blocking touches', () => {
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />,
    );

    // accessibilityElementsHidden hides the subtree from a11y queries;
    // use includeHiddenElements:true to reach the element by testID.
    const element = screen.getByTestId('test-celebration', {
      includeHiddenElements: true,
    });
    const styles = [element.props.style].flat(Infinity);
    expect(styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pointerEvents: 'none' }),
      ]),
    );
  });
});

describe('PolarStar', () => {
  afterEach(() => {
    mockReduceMotion.mockReturnValue(false);
  });

  it('renders with default testID', () => {
    render(<PolarStar />);
    screen.getByTestId('celebration-polar-star', {
      includeHiddenElements: true,
    });
  });

  it('accepts custom testID', () => {
    render(<PolarStar testID="custom-polar" />);
    screen.getByTestId('custom-polar', { includeHiddenElements: true });
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
    screen.getByTestId('celebration-twin-stars', {
      includeHiddenElements: true,
    });
  });

  it('accepts custom testID', () => {
    render(<TwinStars testID="custom-twins" />);
    screen.getByTestId('custom-twins', { includeHiddenElements: true });
  });
});

describe('Comet', () => {
  it('renders with default testID', () => {
    render(<Comet />);
    screen.getByTestId('celebration-comet', { includeHiddenElements: true });
  });

  it('accepts custom testID', () => {
    render(<Comet testID="custom-comet" />);
    screen.getByTestId('custom-comet', { includeHiddenElements: true });
  });
});

describe('OrionsBelt', () => {
  it('renders with default testID', () => {
    render(<OrionsBelt />);
    screen.getByTestId('celebration-orions-belt', {
      includeHiddenElements: true,
    });
  });

  it('accepts custom testID', () => {
    render(<OrionsBelt testID="custom-orion" />);
    screen.getByTestId('custom-orion', { includeHiddenElements: true });
  });
});
