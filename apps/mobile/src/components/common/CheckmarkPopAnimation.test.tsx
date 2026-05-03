import { render } from '@testing-library/react-native';
import { CheckmarkPopAnimation } from './CheckmarkPopAnimation';

describe('CheckmarkPopAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(
      <CheckmarkPopAnimation testID="checkmark" />
    );
    getByTestId('checkmark');
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(
      <CheckmarkPopAnimation testID="checkmark" />
    );
    const el = getByTestId('checkmark');
    expect(el.props.accessibilityLabel).toBe('Success');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <CheckmarkPopAnimation
        testID="checkmark"
        size={60}
        color="#ff0000"
        strokeWidth={4}
      />
    );
    getByTestId('checkmark');
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
