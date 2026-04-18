import { render } from '@testing-library/react-native';
import { BookPageFlipAnimation } from './BookPageFlipAnimation';

describe('BookPageFlipAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<BookPageFlipAnimation testID="book" />);
    expect(getByTestId('book')).toBeTruthy();
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<BookPageFlipAnimation testID="book" />);
    const el = getByTestId('book');
    expect(el.props.accessibilityLabel).toBe('Loading content');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <BookPageFlipAnimation testID="book" size={80} color="#3b82f6" />
    );
    expect(getByTestId('book')).toBeTruthy();
  });

  it('renders in reduced motion mode without crashing', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId } = render(<BookPageFlipAnimation testID="book" />);
    expect(getByTestId('book')).toBeTruthy();

    reanimated.useReducedMotion = original;
  });

  it('uses default props when none provided', () => {
    expect(() => {
      render(<BookPageFlipAnimation />);
    }).not.toThrow();
  });

  // BM-02: transformOrigin must use array syntax, not string syntax.
  // String syntax like 'left center' crashes in Reanimated 3.x+ / New Architecture.
  it('uses array syntax for transformOrigin (BM-02)', () => {
    // We verify the source module does not contain string-based transformOrigin.
    // The animated styles are constructed via useAnimatedStyle which returns
    // worklet closures, so we validate the source directly.
    const sourceModule = require('./BookPageFlipAnimation');
    const sourceText = sourceModule.BookPageFlipAnimation.toString();
    // The component function string should NOT contain 'left center' or 'right center'
    // string-based transformOrigin values. Array syntax is ['0%', '50%', 0].
    expect(sourceText).not.toContain("'left center'");
    expect(sourceText).not.toContain("'right center'");
    expect(sourceText).not.toContain("'center center'");
  });

  // BR-01: animations must be cancelled on unmount to prevent leaked UI-thread work
  it('cancels animations on unmount (BR-01)', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount } = render(<BookPageFlipAnimation testID="book" />);
    unmount();

    // Three page shared values should each be cancelled
    expect(cancelSpy).toHaveBeenCalledTimes(3);
    cancelSpy.mockRestore();
  });

  // ANIM-IMPROVE: pages should use perspective for 3D depth.
  // Fragility note: toString() source inspection can break under minification
  // or transpilation. Ideally we'd assert on the animated style output, but
  // the reanimated mock returns empty objects for useAnimatedStyle. This is
  // acceptable for a regression guard in dev — revisit if it becomes flaky.
  it('uses perspective in page styles (ANIM-IMPROVE)', () => {
    const sourceModule = require('./BookPageFlipAnimation');
    const sourceText = sourceModule.BookPageFlipAnimation.toString();
    expect(sourceText).toContain('perspective');
  });

  it('uses rotateY instead of scaleX for 3D flip (ANIM-IMPROVE)', () => {
    const sourceModule = require('./BookPageFlipAnimation');
    const sourceText = sourceModule.BookPageFlipAnimation.toString();
    expect(sourceText).toContain('rotateY');
    expect(sourceText).not.toContain('scaleX');
  });
});
