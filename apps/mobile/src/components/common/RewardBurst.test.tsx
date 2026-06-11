import { render, screen } from '@testing-library/react-native';
import { RewardBurst } from './RewardBurst';

describe('RewardBurst', () => {
  it('renders without crashing with required variant prop', () => {
    const { toJSON } = render(
      <RewardBurst variant="vocabulary" testID="reward-burst" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the outer accessible container with testID', () => {
    render(<RewardBurst variant="vocabulary" testID="reward-burst" />);
    // includeHiddenElements: the container itself has accessibilityElementsHidden
    // to hide the decoration from screen readers — RTLR respects that by default.
    const el = screen.getByTestId('reward-burst', {
      includeHiddenElements: true,
    });
    expect(el).toBeTruthy();
  });

  it('hides from accessibility tree (decorative animation)', () => {
    render(<RewardBurst variant="vocabulary" testID="reward-burst" />);
    const el = screen.getByTestId('reward-burst', {
      includeHiddenElements: true,
    });
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
    // Text is inside the accessibility-hidden burst container
    screen.getByText('Great job!', { includeHiddenElements: true });
  });

  it('uses variant label when message is not provided', () => {
    render(<RewardBurst variant="vocabulary" testID="reward-burst" />);
    screen.getByText('Got it', { includeHiddenElements: true });
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

  it('uses no hardcoded hex colours — all colours come from semantic tokens (BUG-377)', () => {
    // Forward-only guard: prevents re-introducing raw hex literals into variant
    // colour arrays or any inline style in this shared common component.
    // Hex is only allowed in brand-fixed celebration components (AGENTS.md exception).
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'RewardBurst.tsx'),
      'utf8',
    );
    const hexMatches = source.match(/'#[0-9a-fA-F]{3,8}'/g) ?? [];
    expect(hexMatches).toHaveLength(0);
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
