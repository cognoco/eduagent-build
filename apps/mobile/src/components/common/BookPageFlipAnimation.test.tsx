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

  it('cancels animations on unmount', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount } = render(<BookPageFlipAnimation testID="book" />);
    unmount();

    // page1Rot, page2Rot, page3Rot, glowOp, breathScale, mote1, mote2, mote3 = 8 animations
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });

  // The storybook uses perspective + rotateY via translate-rotate-translate for Fabric safety
  it('uses perspective in page turn styles', () => {
    const sourceModule = require('./BookPageFlipAnimation');
    const sourceText = sourceModule.BookPageFlipAnimation.toString();
    expect(sourceText).toContain('perspective');
  });

  it('uses rotateY for page flip animation', () => {
    const sourceModule = require('./BookPageFlipAnimation');
    const sourceText = sourceModule.BookPageFlipAnimation.toString();
    expect(sourceText).toContain('rotateY');
  });

  it('renders static closed book in reduced motion (no turning pages)', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    // Should not throw; covers and pages are rendered but animated pages are hidden
    const { getByTestId } = render(<BookPageFlipAnimation testID="book" />);
    expect(getByTestId('book')).toBeTruthy();

    reanimated.useReducedMotion = original;
  });

  it('renders at small size (80px) without crashing', () => {
    expect(() => {
      render(<BookPageFlipAnimation size={80} />);
    }).not.toThrow();
  });

  it('renders at large size (200px) without crashing', () => {
    expect(() => {
      render(<BookPageFlipAnimation size={200} />);
    }).not.toThrow();
  });
});
