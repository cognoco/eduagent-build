import { render, screen } from '@testing-library/react-native';
import { RewardBurst } from './RewardBurst';

// RewardBurst uses useThemeColors — provide minimal theme context via mock.
// ThemeContext provides a stable default (light scheme, no accent), so
// the component can resolve textPrimary / textInverse from design-tokens.
jest.mock('../../lib/theme', () => {
  const actual = jest.requireActual('../../lib/theme');
  return actual;
});

describe('RewardBurst', () => {
  it('renders without crashing with required variant prop', () => {
    const { toJSON } = render(
      <RewardBurst variant="vocabulary" testID="reward-burst" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the outer accessible container with testID', () => {
    render(<RewardBurst variant="vocabulary" testID="reward-burst" />);
    const el = screen.getByTestId('reward-burst');
    expect(el).toBeTruthy();
  });

  it('hides from accessibility tree (decorative animation)', () => {
    render(<RewardBurst variant="vocabulary" testID="reward-burst" />);
    const el = screen.getByTestId('reward-burst');
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('renders null when reduced motion is enabled', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { toJSON } = render(<RewardBurst variant="vocabulary" />);
    expect(toJSON()).toBeNull();

    reanimated.useReducedMotion = original;
  });

  it('renders the badge with provided message', () => {
    render(
      <RewardBurst
        variant="vocabulary"
        message="Great job!"
        testID="reward-burst"
      />,
    );
    screen.getByText('Great job!');
  });

  it('uses variant label when message is not provided', () => {
    render(<RewardBurst variant="vocabulary" testID="reward-burst" />);
    screen.getByText('Got it');
  });

  it('does not use hardcoded #000000 shadow or #ffffff text color', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'RewardBurst.tsx'),
      'utf8',
    );
    // These hardcoded values must not appear in the source (bugs 168 + 228)
    expect(source).not.toContain("shadowColor: '#000000'");
    expect(source).not.toContain("color: '#ffffff'");
  });

  it('cancels animations on unmount', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount } = render(
      <RewardBurst variant="vocabulary" testID="reward-burst" />,
    );
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
