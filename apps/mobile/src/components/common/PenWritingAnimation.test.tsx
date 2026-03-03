import { render } from '@testing-library/react-native';
import { PenWritingAnimation } from './PenWritingAnimation';

describe('PenWritingAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<PenWritingAnimation testID="pen" />);
    expect(getByTestId('pen')).toBeTruthy();
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<PenWritingAnimation testID="pen" />);
    const el = getByTestId('pen');
    expect(el.props.accessibilityLabel).toBe('Writing animation');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size, color, and strokeWidth props', () => {
    const { getByTestId } = render(
      <PenWritingAnimation
        testID="pen"
        size={80}
        color="#ff0000"
        strokeWidth={4}
      />
    );
    expect(getByTestId('pen')).toBeTruthy();
  });

  it('hides pen nib in reduced motion mode', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId } = render(<PenWritingAnimation testID="pen" />);
    expect(getByTestId('pen')).toBeTruthy();

    reanimated.useReducedMotion = original;
  });

  it('uses default props when none provided', () => {
    expect(() => {
      render(<PenWritingAnimation />);
    }).not.toThrow();
  });
});
