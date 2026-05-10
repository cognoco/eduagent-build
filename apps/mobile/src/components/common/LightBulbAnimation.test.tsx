import { render } from '@testing-library/react-native';
import { LightBulbAnimation } from './LightBulbAnimation';

describe('LightBulbAnimation', () => {
  it('renders without crashing at default size', () => {
    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    getByTestId('bulb');
  });

  it('renders at 64px (default size)', () => {
    const { getByTestId } = render(
      <LightBulbAnimation testID="bulb" size={64} />,
    );
    const el = getByTestId('bulb');
    // width: size = 64
    expect(el.props.style).toMatchObject({ width: 64 });
  });

  it('renders at 96px (custom size)', () => {
    const { getByTestId } = render(
      <LightBulbAnimation testID="bulb" size={96} />,
    );
    const el = getByTestId('bulb');
    expect(el.props.style).toMatchObject({ width: 96 });
  });

  it('accepts a color prop without crashing', () => {
    expect(() => {
      render(<LightBulbAnimation testID="bulb" color="#3b82f6" />);
    }).not.toThrow();
  });

  it('has accessibility label "Thinking" and role "image"', () => {
    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    const el = getByTestId('bulb');
    expect(el.props.accessibilityLabel).toBe('Thinking');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('renders in reduced motion mode without crashing (static fully-lit bulb)', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    try {
      const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
      getByTestId('bulb');
    } finally {
      reanimated.useReducedMotion = original;
    }
  });

  it('renders with no props supplied (pure defaults)', () => {
    expect(() => {
      render(<LightBulbAnimation />);
    }).not.toThrow();
  });

  it('cancels animations on unmount', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount } = render(<LightBulbAnimation testID="bulb" />);
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
