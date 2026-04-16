import { render } from '@testing-library/react-native';
import { LightBulbAnimation } from './LightBulbAnimation';

const mockReduceMotion = jest.fn(() => false);

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      Text: View,
      ScrollView: View,
      createAnimatedComponent: (c: unknown) => c,
    },
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useSharedValue: (v: unknown) => ({ value: v }),
    useReducedMotion: () => mockReduceMotion(),
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    cancelAnimation: () => undefined,
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

describe('LightBulbAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    expect(getByTestId('bulb')).toBeTruthy();
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    const el = getByTestId('bulb');
    expect(el.props.accessibilityLabel).toBe('Thinking');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <LightBulbAnimation testID="bulb" size={80} color="#ff0000" />
    );
    expect(getByTestId('bulb')).toBeTruthy();
  });

  it('renders in reduced motion mode without crashing', () => {
    mockReduceMotion.mockReturnValue(true);

    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    expect(getByTestId('bulb')).toBeTruthy();

    mockReduceMotion.mockReturnValue(false);
  });

  it('uses default props when none provided', () => {
    expect(() => {
      render(<LightBulbAnimation />);
    }).not.toThrow();
  });

  // Note: cancelAnimation cleanup is handled by useEffect return, but testing
  // it via spy is brittle (couples to implementation detail). Memory leak risk
  // is better caught by runtime profiling than mock assertions.
});
