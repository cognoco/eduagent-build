import { render, fireEvent, act } from '@testing-library/react-native';
import { AnimatedSplash } from './AnimatedSplash';

// Override withTiming in the global reanimated mock so callbacks fire
// synchronously. The global test-setup mock drops the callback entirely
// (returns the value only), which prevents testing onComplete delivery.
// We patch only withTiming here so every other mock stays intact.
beforeEach(() => {
  const reanimated = require('react-native-reanimated');
  reanimated.useReducedMotion = () => false;
  reanimated.withTiming = (
    value: unknown,
    _options?: unknown,
    callback?: (finished: boolean) => void,
  ) => {
    callback?.(true);
    return value;
  };
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('AnimatedSplash', () => {
  it('renders without crashing', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    getByTestId('animated-splash');
  });

  it('renders splash-wordmark element', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    getByTestId('splash-wordmark');
  });

  it('calls onComplete when reduced motion is enabled', () => {
    require('react-native-reanimated').useReducedMotion = () => true;

    const onComplete = jest.fn();
    render(<AnimatedSplash onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);
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

  it('stops accepting touches when the fade-out phase begins', () => {
    jest.useFakeTimers();
    require('react-native-reanimated').withTiming = (value: unknown) => value;

    const onComplete = jest.fn();
    const { getByTestId } = render(<AnimatedSplash onComplete={onComplete} />);
    const root = getByTestId('animated-splash');

    expect(root.props.pointerEvents).toBe('auto');

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(getByTestId('animated-splash').props.pointerEvents).toBe('none');
  });

  it('delivers completion from the watchdog when animation callbacks are dropped', () => {
    jest.useFakeTimers();
    require('react-native-reanimated').withTiming = (value: unknown) => value;

    const onComplete = jest.fn();
    render(<AnimatedSplash onComplete={onComplete} />);

    act(() => {
      jest.advanceTimersByTime(3300);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
