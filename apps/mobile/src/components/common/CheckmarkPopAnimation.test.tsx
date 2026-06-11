import { render } from '@testing-library/react-native';
import { CheckmarkPopAnimation } from './CheckmarkPopAnimation';

describe('CheckmarkPopAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(
      <CheckmarkPopAnimation testID="checkmark" />,
    );
    getByTestId('checkmark', { includeHiddenElements: true });
  });

  it('is hidden from screen readers (decorative animation)', () => {
    const { getByTestId } = render(
      <CheckmarkPopAnimation testID="checkmark" />,
    );
    const el = getByTestId('checkmark', { includeHiddenElements: true });
    // Decorative animation — hidden from SR so users don't hear "image, Success"
    expect(el.props.accessible).toBe(false);
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <CheckmarkPopAnimation
        testID="checkmark"
        size={60}
        color="#ff0000"
        strokeWidth={4}
      />,
    );
    getByTestId('checkmark', { includeHiddenElements: true });
  });

  it('calls onComplete in reduced motion mode', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const onComplete = jest.fn();
    render(<CheckmarkPopAnimation onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);

    reanimated.useReducedMotion = original;
  });

  it('does not crash when onComplete is omitted', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    expect(() => {
      render(<CheckmarkPopAnimation />);
    }).not.toThrow();

    reanimated.useReducedMotion = original;
  });
});
