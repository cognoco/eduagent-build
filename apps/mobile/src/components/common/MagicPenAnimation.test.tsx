import { render } from '@testing-library/react-native';
import { MagicPenAnimation } from './MagicPenAnimation';

// Note: react-native-reanimated and react-native-svg are mocked globally in
// test-setup.ts. useReducedMotion defaults to () => false there.

type JsonTree = ReturnType<ReturnType<typeof render>['toJSON']>;

function hasNodeWithProps(
  node: JsonTree,
  expected: Record<string, unknown>,
): boolean {
  if (!node || typeof node !== 'object') return false;
  if ('props' in node) {
    const matches = Object.entries(expected).every(
      ([key, value]) => node.props?.[key] === value,
    );
    if (matches) return true;
  }
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.some((child: unknown) =>
      hasNodeWithProps(child as JsonTree, expected),
    );
  }
  return false;
}

describe('MagicPenAnimation', () => {
  it('renders without crashing at default size', () => {
    const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
    getByTestId('pen');
  });

  it('has an accessibility label and role', () => {
    const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
    const el = getByTestId('pen');
    expect(el.props.accessibilityLabel).toBe('Writing animation');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts size prop at 48px', () => {
    const { getByTestId } = render(
      <MagicPenAnimation testID="pen" size={48} />,
    );
    const el = getByTestId('pen');
    expect(el.props.style).toMatchObject({ width: 48, height: 48 });
  });

  it('accepts size prop at 100px', () => {
    const { getByTestId } = render(
      <MagicPenAnimation testID="pen" size={100} />,
    );
    const el = getByTestId('pen');
    expect(el.props.style).toMatchObject({ width: 100, height: 100 });
  });

  it('accepts color prop', () => {
    expect(() => {
      render(<MagicPenAnimation testID="pen" color="#ff0000" />);
    }).not.toThrow();
  });

  it('renders the fountain pen with cap, steel nib, and yellow tip ink bead', () => {
    const { toJSON } = render(
      <MagicPenAnimation testID="pen" color="#2dd4bf" />,
    );
    const tree = toJSON();
    // Dark cap finial / grip / thread ring
    expect(hasNodeWithProps(tree, { fill: '#1a1a1a' })).toBe(true);
    // Silver steel nib
    expect(hasNodeWithProps(tree, { fill: '#cfd4dc' })).toBe(true);
    // Polished steel grip ring
    expect(hasNodeWithProps(tree, { fill: '#9aa3ad' })).toBe(true);
    // Yellow ink bead at writing tip
    expect(hasNodeWithProps(tree, { fill: '#fbbf24' })).toBe(true);
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
        <MagicPenAnimation testID="pen" size={80} color="#8b5cf6" />,
      );
      const el = getByTestId('pen');
      expect(el.props.style).toMatchObject({ width: 80, height: 80 });
    } finally {
      reanimated.useReducedMotion = original;
    }
  });
});
