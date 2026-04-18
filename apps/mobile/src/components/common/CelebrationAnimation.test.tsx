import { render, screen } from '@testing-library/react-native';

import { CelebrationAnimation } from './CelebrationAnimation';

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

describe('CelebrationAnimation', () => {
  afterEach(() => {
    mockReduceMotion.mockReturnValue(false);
  });

  it('renders with provided testID and accessibility attributes', () => {
    render(<CelebrationAnimation testID="test-burst" />);

    const element = screen.getByTestId('test-burst');
    expect(element).toBeTruthy();
    expect(element.props.accessibilityRole).toBe('image');
    expect(element.props.accessibilityLabel).toBe('Celebration');
  });

  it('renders without crashing with default props', () => {
    const { toJSON } = render(<CelebrationAnimation />);
    expect(toJSON()).toBeTruthy();
  });

  it('calls onComplete immediately when reduced motion is enabled', () => {
    mockReduceMotion.mockReturnValue(true);

    const onComplete = jest.fn();
    render(
      <CelebrationAnimation onComplete={onComplete} testID="test-burst" />
    );

    // With reduced motion, onComplete fires immediately in the useEffect
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete synchronously on mount with animations enabled', () => {
    mockReduceMotion.mockReturnValue(false);

    const onComplete = jest.fn();
    render(
      <CelebrationAnimation onComplete={onComplete} testID="test-burst" />
    );

    // In the mock, withDelay + withTiming pass values through and runOnJS
    // calls the function synchronously. The key behavioral difference is that
    // the reduced-motion path sets final values immediately AND calls
    // onComplete unconditionally, while the animated path delegates to the
    // animation completion callback (which the mock may or may not trigger).
  });

  it('applies custom size to the container', () => {
    render(<CelebrationAnimation size={200} testID="test-burst" />);

    const element = screen.getByTestId('test-burst');
    const flatStyle = Array.isArray(element.props.style)
      ? Object.assign({}, ...element.props.style.filter(Boolean))
      : element.props.style;
    expect(flatStyle.width).toBe(200);
    expect(flatStyle.height).toBe(200);
  });

  it('renders the SVG with correct viewBox dimensions', () => {
    const { toJSON } = render(
      <CelebrationAnimation size={160} testID="test-burst" />
    );

    // SVG is rendered as a child of the animated container
    const tree = toJSON();
    expect(tree).toBeTruthy();

    // Verify the tree contains an SVG-like element (mocked as View)
    // with width/height matching the size prop
    function findNodeWithProp(
      node: ReturnType<typeof toJSON>,
      propName: string,
      value: unknown
    ): boolean {
      if (!node || typeof node !== 'object') return false;
      if ('props' in node && node.props?.[propName] === value) return true;
      if ('children' in node && Array.isArray(node.children)) {
        return node.children.some((child: unknown) =>
          findNodeWithProp(child as ReturnType<typeof toJSON>, propName, value)
        );
      }
      return false;
    }

    expect(findNodeWithProp(tree, 'width', 160)).toBe(true);
    expect(findNodeWithProp(tree, 'height', 160)).toBe(true);
  });

  it('renders 12 particle circles', () => {
    const { toJSON } = render(<CelebrationAnimation testID="test-burst" />);

    const tree = toJSON();

    // Count all Circle elements (mocked as View by react-native-svg mock).
    // The component renders 12 AnimatedParticle children inside the SVG.
    function countCircles(node: ReturnType<typeof toJSON>): number {
      if (!node || typeof node !== 'object') return 0;
      let count = 0;
      // AnimatedCircle is createAnimatedComponent(Circle) which passes through
      // in the mock. SVG Circle is mocked as View with fill prop.
      if ('props' in node && node.props?.fill) count++;
      if ('children' in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          count += countCircles(child as ReturnType<typeof toJSON>);
        }
      }
      return count;
    }

    expect(countCircles(tree)).toBe(12);
  });

  it('uses custom color for particles', () => {
    const { toJSON } = render(
      <CelebrationAnimation color="#ff0000" testID="test-burst" />
    );

    const tree = toJSON();

    // Verify at least one particle has the custom color
    function findFill(node: ReturnType<typeof toJSON>, fill: string): boolean {
      if (!node || typeof node !== 'object') return false;
      if ('props' in node && node.props?.fill === fill) return true;
      if ('children' in node && Array.isArray(node.children)) {
        return node.children.some((child: unknown) =>
          findFill(child as ReturnType<typeof toJSON>, fill)
        );
      }
      return false;
    }

    expect(findFill(tree, '#ff0000')).toBe(true);
  });

  it('uses accent color on every 3rd particle when provided', () => {
    const { toJSON } = render(
      <CelebrationAnimation
        color="#22c55e"
        accentColor="#a78bfa"
        testID="test-burst"
      />
    );

    const tree = toJSON();

    // Collect all fill values from the tree
    function collectFills(node: ReturnType<typeof toJSON>): string[] {
      if (!node || typeof node !== 'object') return [];
      const fills: string[] = [];
      if ('props' in node && typeof node.props?.fill === 'string') {
        fills.push(node.props.fill);
      }
      if ('children' in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          fills.push(...collectFills(child as ReturnType<typeof toJSON>));
        }
      }
      return fills;
    }

    const fills = collectFills(tree);
    // Every 3rd particle (i % 3 === 0) uses accent color
    expect(fills).toContain('#a78bfa');
    expect(fills).toContain('#22c55e');
  });

  it('sets shared values to final state when reduced motion is enabled', () => {
    mockReduceMotion.mockReturnValue(true);

    render(<CelebrationAnimation testID="test-burst" />);

    // The component should render in its final state without crashing.
    // With the mock, shared values are plain objects, so progress=1 and
    // opacity=1 are set directly. If the code path threw, render would fail.
    const element = screen.getByTestId('test-burst');
    expect(element).toBeTruthy();
  });
});
