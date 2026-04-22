import { render } from '@testing-library/react-native';
import { DeskLampAnimation } from './DeskLampAnimation';

describe('DeskLampAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<DeskLampAnimation testID="lamp" />);
    expect(getByTestId('lamp')).toBeTruthy();
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<DeskLampAnimation testID="lamp" />);
    const el = getByTestId('lamp');
    expect(el.props.accessibilityLabel).toBe('Thinking');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <DeskLampAnimation testID="lamp" size={80} color="#3b82f6" />
    );
    expect(getByTestId('lamp')).toBeTruthy();
  });

  it('renders in reduced motion mode without crashing', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId } = render(<DeskLampAnimation testID="lamp" />);
    expect(getByTestId('lamp')).toBeTruthy();

    reanimated.useReducedMotion = original;
  });

  it('uses default props when none provided', () => {
    expect(() => {
      render(<DeskLampAnimation />);
    }).not.toThrow();
  });

  it('cancels animations on unmount', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount } = render(<DeskLampAnimation testID="lamp" />);
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
