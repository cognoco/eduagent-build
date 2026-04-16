import { render } from '@testing-library/react-native';
import { MagicPenAnimation } from './MagicPenAnimation';

describe('MagicPenAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
    expect(getByTestId('pen')).toBeTruthy();
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
    const el = getByTestId('pen');
    expect(el.props.accessibilityLabel).toBe('Writing animation');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <MagicPenAnimation testID="pen" size={100} color="#ff0000" />
    );
    expect(getByTestId('pen')).toBeTruthy();
  });

  it('renders in reduced motion mode without crashing', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId } = render(<MagicPenAnimation testID="pen" />);
    expect(getByTestId('pen')).toBeTruthy();

    reanimated.useReducedMotion = original;
  });

  it('uses default props when none provided', () => {
    expect(() => {
      render(<MagicPenAnimation />);
    }).not.toThrow();
  });

  // Note: cancelAnimation cleanup is handled by useEffect return, but testing
  // it via spy is brittle (couples to implementation detail). Memory leak risk
  // is better caught by runtime profiling than mock assertions.
});
