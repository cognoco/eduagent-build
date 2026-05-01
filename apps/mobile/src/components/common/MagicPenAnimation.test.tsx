import { render } from '@testing-library/react-native';
import { MagicPenAnimation } from './MagicPenAnimation';

// Note: react-native-reanimated and react-native-svg are mocked globally in
// test-setup.ts. useReducedMotion defaults to () => false there.

describe('MagicPenAnimation', () => {
  it('renders without crashing at default size', () => {
    const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
    expect(getByTestId('pen')).toBeTruthy();
  });

  it('has an accessibility label and role', () => {
    const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
    const el = getByTestId('pen');
    expect(el.props.accessibilityLabel).toBe('Writing animation');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts size prop at 48px', () => {
    const { getByTestId } = render(
      <MagicPenAnimation testID="pen" size={48} />
    );
    const el = getByTestId('pen');
    expect(el).toBeTruthy();
    expect(el.props.style).toMatchObject({ width: 48, height: 48 });
  });

  it('accepts size prop at 100px', () => {
    const { getByTestId } = render(
      <MagicPenAnimation testID="pen" size={100} />
    );
    const el = getByTestId('pen');
    expect(el).toBeTruthy();
    expect(el.props.style).toMatchObject({ width: 100, height: 100 });
  });

  it('accepts color prop', () => {
    expect(() => {
      render(<MagicPenAnimation testID="pen" color="#ff0000" />);
    }).not.toThrow();
  });

  it('uses default props when none provided', () => {
    expect(() => {
      render(<MagicPenAnimation />);
    }).not.toThrow();
  });

  it('renders in reduced motion mode without crashing (static render path)', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    // Return true to exercise the static/reduced-motion branch
    reanimated.useReducedMotion = () => true;

    try {
      const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
      const el = getByTestId('pen');
      expect(el).toBeTruthy();
      expect(el.props.accessibilityLabel).toBe('Writing animation');
    } finally {
      reanimated.useReducedMotion = original;
    }
  });

  it('reduced motion render has correct dimensions', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    try {
      const { getByTestId } = render(
        <MagicPenAnimation testID="pen" size={80} color="#8b5cf6" />
      );
      const el = getByTestId('pen');
      expect(el.props.style).toMatchObject({ width: 80, height: 80 });
    } finally {
      reanimated.useReducedMotion = original;
    }
  });
});
