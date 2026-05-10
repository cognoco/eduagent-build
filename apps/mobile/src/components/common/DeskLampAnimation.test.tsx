import { render } from '@testing-library/react-native';
import { DeskLampAnimation } from './DeskLampAnimation';

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

describe('DeskLampAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<DeskLampAnimation testID="lamp" />);
    getByTestId('lamp');
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<DeskLampAnimation testID="lamp" />);
    const el = getByTestId('lamp');
    expect(el.props.accessibilityLabel).toBe('Thinking');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <DeskLampAnimation testID="lamp" size={80} color="#3b82f6" />,
    );
    getByTestId('lamp');
  });

  it('keeps the lamp base visible on dark backgrounds', () => {
    const { toJSON } = render(<DeskLampAnimation testID="lamp" dark />);
    expect(
      hasNodeWithProps(toJSON(), {
        stroke: '#f0c97c',
        strokeOpacity: 0.9,
      }),
    ).toBe(true);
  });

  it('keeps the lamp base visible on light backgrounds', () => {
    const { toJSON } = render(<DeskLampAnimation testID="lamp" dark={false} />);
    expect(
      hasNodeWithProps(toJSON(), {
        stroke: '#8b6a2e',
        strokeOpacity: 0.55,
      }),
    ).toBe(true);
  });

  it('renders in reduced motion mode without crashing', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId } = render(<DeskLampAnimation testID="lamp" />);
    getByTestId('lamp');

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
