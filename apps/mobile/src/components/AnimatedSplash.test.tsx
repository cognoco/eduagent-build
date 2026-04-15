import { render, fireEvent } from '@testing-library/react-native';
import { AnimatedSplash } from './AnimatedSplash';

// Override withTiming in the global reanimated mock so callbacks fire
// synchronously. The global test-setup mock drops the callback entirely
// (returns the value only), which prevents testing onComplete delivery.
// We patch only withTiming here so every other mock stays intact.
beforeEach(() => {
  const reanimated = require('react-native-reanimated');
  reanimated.withTiming = (
    value: unknown,
    _options?: unknown,
    callback?: (finished: boolean) => void
  ) => {
    callback?.(true);
    return value;
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AnimatedSplash', () => {
  it('renders without crashing', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    expect(getByTestId('animated-splash')).toBeTruthy();
  });

  it('renders splash-wordmark element', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    expect(getByTestId('splash-wordmark')).toBeTruthy();
  });

  it('calls onComplete when reduced motion is enabled', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const onComplete = jest.fn();
    render(<AnimatedSplash onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);

    reanimated.useReducedMotion = original;
  });

  it('uses dark background color in dark mode', () => {
    jest
      .spyOn(require('react-native'), 'useColorScheme')
      .mockReturnValue('dark');

    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    const root = getByTestId('animated-splash');
    // Style is an array: [absoluteFill styles, { backgroundColor }, animatedStyle]
    // StyleSheet.flatten resolves the array to a single object
    const { StyleSheet } = require('react-native');
    const flat = StyleSheet.flatten(root.props.style);
    expect(flat.backgroundColor).toBe('#1a1a3e');
  });

  it('uses light background color in light mode', () => {
    jest
      .spyOn(require('react-native'), 'useColorScheme')
      .mockReturnValue('light');

    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    const root = getByTestId('animated-splash');
    const { StyleSheet } = require('react-native');
    const flat = StyleSheet.flatten(root.props.style);
    expect(flat.backgroundColor).toBe('#faf5ee');
  });

  it('calls onComplete on tap (skip)', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    // The Pressable wraps the full splash area — press on the root
    fireEvent.press(getByTestId('animated-splash'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
