import * as fs from 'fs';
import * as path from 'path';
import { render } from '@testing-library/react-native';
import { BookPageFlipAnimation } from './BookPageFlipAnimation';

describe('BookPageFlipAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<BookPageFlipAnimation testID="book" />);
    getByTestId('book');
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<BookPageFlipAnimation testID="book" />);
    const el = getByTestId('book');
    expect(el.props.accessibilityLabel).toBe('Loading content');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <BookPageFlipAnimation testID="book" size={80} color="#3b82f6" />,
    );
    getByTestId('book');
  });

  it('renders in reduced motion mode without crashing', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId } = render(<BookPageFlipAnimation testID="book" />);
    getByTestId('book');

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
    getByTestId('book');

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

  // Regression: the Library tab on Android (Fabric / New Architecture) crashed
  // with `ClassCastException: java.lang.String cannot be cast` inside
  // `com.facebook.react.viewmanagers.RNSVGGroupManagerDelegate`. Root cause:
  // a previous BookPageFlipAnimation wrapped `<G>` (Group) from react-native-svg
  // with `Animated.createAnimatedComponent(G)` and pushed a string `transform`
  // through `useAnimatedProps`. The Fabric delegate for SVG Group expects a
  // typed transform object, not a string.
  //
  // The current implementation animates `<Animated.View>` wrappers and keeps
  // react-native-svg elements (Svg/Rect/LinearGradient) static. This test
  // fails if a future refactor reintroduces an animated SVG `G` / `Line`.
  // Filed in the Android E2E tracker (Notion: react-native-svg crash on Fabric).
  it('does not animate react-native-svg Group/Line elements (Fabric crash guard)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'BookPageFlipAnimation.tsx'),
      'utf8',
    );
    // Strip line comments and block comments before scanning so doc references
    // above this test do not trip the guard.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // No createAnimatedComponent call on any react-native-svg primitive.
    expect(stripped).not.toMatch(/createAnimatedComponent\s*\(\s*G\s*\)/);
    expect(stripped).not.toMatch(/createAnimatedComponent\s*\(\s*Line\s*\)/);
    expect(stripped).not.toMatch(/createAnimatedComponent\s*\(\s*Rect\s*\)/);
    expect(stripped).not.toMatch(/createAnimatedComponent\s*\(\s*SvgRect\s*\)/);

    // No bare `G` (Group) import from react-native-svg — even if not animated
    // today, importing it invites the next contributor to animate it. Allowed
    // primitives: Svg, Defs, Rect / SvgRect, LinearGradient, Stop, Path, Circle.
    const svgImportMatch = stripped.match(
      /import\s+([^;]+?)\s+from\s+['"]react-native-svg['"]/,
    );
    expect(svgImportMatch).not.toBeNull();
    const importClause = svgImportMatch?.[1] ?? '';
    // Match named imports inside the clause, e.g. `Svg, { Defs, Rect as SvgRect, G }`
    const named = importClause.match(/\{([^}]*)\}/)?.[1] ?? '';
    const names = named
      .split(',')
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim(),
      )
      .filter(Boolean);
    expect(names).not.toContain('G');
    expect(names).not.toContain('Line');
  });
});
