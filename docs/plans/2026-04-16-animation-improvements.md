# Animation Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace invisible/flat animations with impressive, Fabric-safe alternatives — magic pen with ink, pulsing light bulb, 3D book page flip, celebration fixes.

**Architecture:** New animation components use `Animated.View` + `useAnimatedStyle` for all positioning/glow effects (proven Fabric-safe). SVG is used only for static shapes and `AnimatedPath` with `strokeDashoffset` (also proven). No `AnimatedG`, no `AnimatedCircle` with `r=0`.

**Tech Stack:** react-native-reanimated v4, react-native-svg 15, Fabric (New Architecture), NativeWind/Tailwind classes.

**Spec:** `docs/specs/2026-04-16-animation-improvements-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/components/common/LightBulbAnimation.tsx` | Create | "AI thinking" indicator — pulsing glow behind cartoon bulb |
| `apps/mobile/src/components/common/LightBulbAnimation.test.tsx` | Create | Tests for LightBulbAnimation |
| `apps/mobile/src/components/common/MagicPenAnimation.tsx` | Create | "Waiting for child" indicator — cartoon pen writes with ink |
| `apps/mobile/src/components/common/MagicPenAnimation.test.tsx` | Create | Tests for MagicPenAnimation |
| `apps/mobile/src/components/common/BookPageFlipAnimation.tsx` | Rewrite | 3D perspective page turns replacing flat scaleX |
| `apps/mobile/src/components/common/BookPageFlipAnimation.test.tsx` | Update | Update tests for 3D transforms + add perspective test |
| `apps/mobile/src/components/common/BrandCelebration.tsx` | Patch | Add 300ms Fabric fallback timer |
| `apps/mobile/src/components/common/CelebrationAnimation.tsx` | Patch | Add 300ms Fabric fallback timer |
| `apps/mobile/src/components/common/index.ts` | Patch | Export new components, remove PenWritingAnimation |
| `apps/mobile/src/components/session/ChatShell.tsx` | Patch | Wire LightBulb + MagicPen, FadeOut exit |
| `apps/mobile/src/components/session/ChatShell.test.tsx` | Patch | Update mocks for new component names |
| `apps/mobile/src/app/(app)/library.tsx` | Patch | BrandCelebration size 36 → 56 |
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | Patch | BrandCelebration size 36 → 56 |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | Patch | PenWritingAnimation → MagicPenAnimation |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx` | Patch | Update mock name |
| `apps/mobile/src/components/common/PenWritingAnimation.tsx` | Delete | No consumers remain |
| `apps/mobile/src/components/common/PenWritingAnimation.test.tsx` | Delete | No consumers remain |

---

### Task 1: LightBulbAnimation — Test + Implementation

**Files:**
- Create: `apps/mobile/src/components/common/LightBulbAnimation.test.tsx`
- Create: `apps/mobile/src/components/common/LightBulbAnimation.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/common/LightBulbAnimation.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { LightBulbAnimation } from './LightBulbAnimation';

describe('LightBulbAnimation', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    expect(getByTestId('bulb')).toBeTruthy();
  });

  it('applies accessibility attributes', () => {
    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    const el = getByTestId('bulb');
    expect(el.props.accessibilityLabel).toBe('Thinking');
    expect(el.props.accessibilityRole).toBe('image');
  });

  it('accepts custom size and color props', () => {
    const { getByTestId } = render(
      <LightBulbAnimation testID="bulb" size={80} color="#ff0000" />
    );
    expect(getByTestId('bulb')).toBeTruthy();
  });

  it('renders in reduced motion mode without crashing', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId } = render(<LightBulbAnimation testID="bulb" />);
    expect(getByTestId('bulb')).toBeTruthy();

    reanimated.useReducedMotion = original;
  });

  it('uses default props when none provided', () => {
    expect(() => {
      render(<LightBulbAnimation />);
    }).not.toThrow();
  });

  // Note: cancelAnimation cleanup is handled by useEffect return, but testing
  // it via spy is brittle (couples to implementation detail). Memory leak risk
  // is better caught by runtime profiling than mock assertions.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/LightBulbAnimation.test.tsx --no-coverage`

Expected: FAIL — module `./LightBulbAnimation` not found.

- [ ] **Step 3: Implement LightBulbAnimation**

Create `apps/mobile/src/components/common/LightBulbAnimation.tsx`:

```tsx
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface LightBulbAnimationProps {
  /** Overall size in pixels (default: 48) */
  size?: number;
  /** Bulb outline color (default: theme muted gray) */
  color?: string;
  testID?: string;
}

// --- SVG paths (viewBox 0 0 64 64) ---
// Bulb silhouette
const BULB_OUTER =
  'M32 4 C18 4 8 16 8 28 C8 38 14 44 20 48 L20 52 L44 52 L44 48 C50 44 56 38 56 28 C56 16 46 4 32 4 Z';
// Screw base
const BASE_TOP = 'M22 52 L42 52 L42 56 L22 56 Z';
const BASE_MID = 'M24 56 L40 56 L40 60 L24 60 Z';
const BASE_BOT = 'M26 60 L38 60 L38 62 L26 62 Z';
// Filaments
const FILAMENT_1 = 'M28 36 C28 28 32 24 32 20';
const FILAMENT_2 = 'M36 36 C36 28 32 24 32 20';

// Glow color
const GLOW_COLOR = '#fbbf24';

// Ray lines — 6 directions radiating from bulb center (viewBox 0 0 64 64)
// Each ray is a short line from just outside the bulb outline outward.
const RAYS = [
  'M32 2 L32 -4',    // top
  'M52 12 L58 6',    // top-right
  'M58 28 L64 28',   // right
  'M52 44 L58 50',   // bottom-right
  'M12 12 L6 6',     // top-left
  'M6 28 L0 28',     // left
];
const RAY_LENGTH = 8;

/**
 * Cartoon light bulb that pulses with a warm glow.
 * Used as "AI is thinking" indicator in ChatShell.
 *
 * Core animation: pulsing Animated.View glow behind a static SVG bulb.
 * All animation uses useAnimatedStyle (Fabric-safe).
 */
export function LightBulbAnimation({
  size = 48,
  color = '#9ca3af',
  testID,
}: LightBulbAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  const showRays = size >= 80;
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.35);
  const rayDash = useSharedValue(RAY_LENGTH);

  useEffect(() => {
    if (reduceMotion) {
      glowScale.value = 1;
      glowOpacity.value = 0.35;
      rayDash.value = 0;
      return;
    }

    // Pulsing glow — the core animation users perceive at 48px
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Rays pulse in sync with glow (only rendered at >= 80px)
    if (showRays) {
      rayDash.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(RAY_LENGTH, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }

    return () => {
      cancelAnimation(glowScale);
      cancelAnimation(glowOpacity);
      cancelAnimation(rayDash);
    };
  }, [reduceMotion, glowScale, glowOpacity, rayDash, showRays]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const rayProps = useAnimatedProps(() => ({
    strokeDashoffset: rayDash.value,
  }));

  const bulbR = size * 0.38;

  return (
    <View
      testID={testID}
      accessibilityLabel="Thinking"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Glow — Animated.View behind the SVG */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: bulbR * 2,
            height: bulbR * 2,
            borderRadius: bulbR,
            backgroundColor: GLOW_COLOR,
            left: size / 2 - bulbR,
            top: size * 0.18,
          },
          glowStyle,
        ]}
        pointerEvents="none"
      />
      {/* Bulb SVG — static shape */}
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {/* Bulb body */}
        <Path d={BULB_OUTER} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {/* Screw base */}
        <Path d={BASE_TOP} fill={color} opacity={0.6} />
        <Path d={BASE_MID} fill={color} opacity={0.5} />
        <Path d={BASE_BOT} fill={color} opacity={0.4} />
        {/* Filaments */}
        <Path d={FILAMENT_1} fill="none" stroke={GLOW_COLOR} strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
        <Path d={FILAMENT_2} fill="none" stroke={GLOW_COLOR} strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
        {/* Rays — only rendered at >= 80px */}
        {showRays && RAYS.map((d, i) => (
          <AnimatedPath
            key={i}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={RAY_LENGTH}
            animatedProps={rayProps}
            opacity={0.5}
          />
        ))}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/LightBulbAnimation.test.tsx --no-coverage`

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/common/LightBulbAnimation.tsx apps/mobile/src/components/common/LightBulbAnimation.test.tsx
git commit -m "feat(mobile): add LightBulbAnimation — pulsing glow 'AI thinking' indicator [ANIM-IMPROVE]"
```

---

### Task 2: MagicPenAnimation — Test + Implementation

**Files:**
- Create: `apps/mobile/src/components/common/MagicPenAnimation.test.tsx`
- Create: `apps/mobile/src/components/common/MagicPenAnimation.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/common/MagicPenAnimation.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/MagicPenAnimation.test.tsx --no-coverage`

Expected: FAIL — module `./MagicPenAnimation` not found.

- [ ] **Step 3: Implement MagicPenAnimation**

Create `apps/mobile/src/components/common/MagicPenAnimation.tsx`:

```tsx
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface MagicPenAnimationProps {
  /** Overall size in pixels (default: 100) */
  size?: number;
  /** Pen/ink color (default: brand teal #0d9488) */
  color?: string;
  testID?: string;
}

// Cursive-like bezier path (viewBox 0 0 120 120)
const WRITING_PATH = 'M 15 80 C 30 20, 50 100, 65 50 S 95 20, 105 60';
const PATH_LENGTH = 140;

// Pen body SVG paths (viewBox 0 0 40 60, pen points downward at ~45deg)
// The pen is drawn pointing down-right so it looks natural on the cursive path.
const PEN_BARREL =
  'M8 0 L32 0 C34 0 36 2 36 4 L36 38 C36 40 34 42 32 42 L8 42 C6 42 4 40 4 38 L4 4 C4 2 6 0 8 0 Z';
const PEN_GRIP = 'M10 42 L30 42 L26 52 L14 52 Z';
const PEN_NIB = 'M14 52 L26 52 L20 60 Z';

// Pen follower endpoints (start and end of the writing path)
const PEN_START_X = 15;
const PEN_START_Y = 80;
const PEN_END_X = 105;
const PEN_END_Y = 60;

// Timing
const DRAW_MS = 1500;
const PAUSE_MS = 600;
const RESET_MS = 300;

// Glow color for nib
const NIB_GLOW = '#fbbf24';

/**
 * Magic pen animation: a cartoon fountain pen follows a cursive SVG path
 * as ink draws itself. The pen body is a static SVG positioned via
 * Animated.View overlay (Fabric-safe).
 *
 * 48px: pen + stroke only (no droplets, no glow). At this size the pen barrel
 *   is ~12px wide — verify on device it still reads as "pen writing." ChatShell
 *   uses 48px; the book screen uses 100px where the full effect lands.
 * 80px+: adds nib glow, ink gradient trail, and 2 ink droplets
 */
export function MagicPenAnimation({
  size = 100,
  color = '#0d9488',
  testID,
}: MagicPenAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const showEnhanced = size >= 80;
  const progress = useSharedValue(0);
  // Ink droplet shared values (only animated at >= 80px)
  const drop1Y = useSharedValue(0);
  const drop1Op = useSharedValue(0);
  const drop2Y = useSharedValue(0);
  const drop2Op = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: DRAW_MS,
          easing: Easing.inOut(Easing.ease),
        }),
        withDelay(PAUSE_MS, withTiming(1, { duration: 0 })),
        withTiming(0, { duration: RESET_MS })
      ),
      -1,
      false
    );

    // Ink droplets — two drops that fall and fade, staggered (>= 80px only)
    if (showEnhanced) {
      drop1Y.value = withRepeat(
        withSequence(
          withDelay(400, withTiming(10, { duration: 600 })),
          withTiming(0, { duration: 0 })
        ), -1, false
      );
      drop1Op.value = withRepeat(
        withSequence(
          withDelay(400, withTiming(0.6, { duration: 100 })),
          withTiming(0, { duration: 500 }),
          withTiming(0, { duration: 0 })
        ), -1, false
      );
      drop2Y.value = withRepeat(
        withSequence(
          withDelay(900, withTiming(12, { duration: 500 })),
          withTiming(0, { duration: 0 })
        ), -1, false
      );
      drop2Op.value = withRepeat(
        withSequence(
          withDelay(900, withTiming(0.5, { duration: 100 })),
          withTiming(0, { duration: 400 }),
          withTiming(0, { duration: 0 })
        ), -1, false
      );
    }

    return () => {
      cancelAnimation(progress);
      cancelAnimation(drop1Y);
      cancelAnimation(drop1Op);
      cancelAnimation(drop2Y);
      cancelAnimation(drop2Op);
    };
  }, [reduceMotion, progress, showEnhanced, drop1Y, drop1Op, drop2Y, drop2Op]);

  // Ink stroke — strokeDashoffset trick (proven Fabric-safe)
  const pathAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - progress.value),
  }));

  // Pen position — Animated.View overlay (proven Fabric-safe)
  const scale = size / 120;
  const penSize = size * 0.25; // pen SVG is 25% of overall size

  const penStyle = useAnimatedStyle(() => {
    const x = PEN_START_X + (PEN_END_X - PEN_START_X) * progress.value;
    const y = PEN_START_Y + (PEN_END_Y - PEN_START_Y) * progress.value;
    return {
      transform: [
        { translateX: x * scale - penSize * 0.5 },
        { translateY: y * scale - penSize * 0.85 },
        { rotate: '35deg' },
      ],
    };
  });

  // Ink droplet styles (Animated.View — Fabric-safe)
  const drop1Style = useAnimatedStyle(() => ({
    opacity: drop1Op.value,
    transform: [{ translateY: drop1Y.value }],
  }));
  const drop2Style = useAnimatedStyle(() => ({
    opacity: drop2Op.value,
    transform: [{ translateY: drop2Y.value }],
  }));

  // Nib glow — only at size >= 80px
  const glowStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.4 * progress.value,
    transform: [
      { translateX: (PEN_START_X + (PEN_END_X - PEN_START_X) * progress.value) * scale - 6 },
      { translateY: (PEN_START_Y + (PEN_END_Y - PEN_START_Y) * progress.value) * scale - 4 },
      { scale: 0.8 + 0.4 * progress.value },
    ],
  }));

  return (
    <View
      testID={testID}
      accessibilityLabel="Writing animation"
      accessibilityRole="image"
      style={{ width: size, height: size, position: 'relative' }}
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* Writing line background (faint guide) */}
        <Path
          d={WRITING_PATH}
          fill="none"
          stroke={color}
          strokeWidth={2.5 * 0.3}
          strokeLinecap="round"
          opacity={0.15}
        />
        {/* Ink gradient trail — faded duplicate behind main stroke (>= 80px) */}
        {showEnhanced && (
          <AnimatedPath
            d={WRITING_PATH}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={PATH_LENGTH}
            animatedProps={pathAnimatedProps}
            opacity={0.15}
          />
        )}
        {/* Animated ink stroke */}
        <AnimatedPath
          d={WRITING_PATH}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={PATH_LENGTH}
          animatedProps={pathAnimatedProps}
        />
      </Svg>

      {/* Ink droplets — Animated.View dots (>= 80px only) */}
      {showEnhanced && !reduceMotion && (
        <>
          <Animated.View
            style={[{ position: 'absolute', left: size * 0.45, top: size * 0.6, width: 4, height: 4, borderRadius: 2, backgroundColor: color }, drop1Style]}
            pointerEvents="none"
          />
          <Animated.View
            style={[{ position: 'absolute', left: size * 0.55, top: size * 0.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }, drop2Style]}
            pointerEvents="none"
          />
        </>
      )}

      {/* Nib glow — Animated.View, only at >= 80px */}
      {showEnhanced && !reduceMotion && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: NIB_GLOW,
            },
            glowStyle,
          ]}
          pointerEvents="none"
        />
      )}

      {/* Pen body — Animated.View overlay with static SVG inside */}
      {!reduceMotion && (
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, width: penSize, height: penSize * 1.5 },
            penStyle,
          ]}
          pointerEvents="none"
        >
          <Svg width={penSize} height={penSize * 1.5} viewBox="0 0 40 60">
            <Path d={PEN_BARREL} fill={color} opacity={0.85} />
            <Path d={PEN_GRIP} fill={color} opacity={0.65} />
            <Path d={PEN_NIB} fill={color} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/MagicPenAnimation.test.tsx --no-coverage`

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/common/MagicPenAnimation.tsx apps/mobile/src/components/common/MagicPenAnimation.test.tsx
git commit -m "feat(mobile): add MagicPenAnimation — cartoon pen with ink writing effect [ANIM-IMPROVE]"
```

---

### Task 3: BookPageFlipAnimation — 3D Upgrade

**Files:**
- Rewrite: `apps/mobile/src/components/common/BookPageFlipAnimation.tsx`
- Update: `apps/mobile/src/components/common/BookPageFlipAnimation.test.tsx`

- [ ] **Step 1: Add perspective test to existing test file**

Add to `apps/mobile/src/components/common/BookPageFlipAnimation.test.tsx`, after the existing `transformOrigin` test:

```tsx
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
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/BookPageFlipAnimation.test.tsx --no-coverage`

Expected: the 2 new tests FAIL (current code uses `scaleX`, no `perspective`). Existing tests should still pass.

- [ ] **Step 3: Rewrite BookPageFlipAnimation with 3D transforms**

Replace entire contents of `apps/mobile/src/components/common/BookPageFlipAnimation.tsx`:

```tsx
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

interface BookPageFlipAnimationProps {
  /** Overall size in pixels (default: 120) */
  size?: number;
  /** Primary color for covers and spine (default: brand violet #8b5cf6) */
  color?: string;
  testID?: string;
}

// Timing
const PAGE_FLIP_MS = 500;
const STAGGER_MS = 300;
const PAUSE_MS = 400;
const RESET_MS = 300;

const COVER_OPACITY = 0.25;
const PAGE_OPACITY = 0.6;
const SPINE_OPACITY = 0.5;

/**
 * Looping book page-flip animation with 3D perspective. Three pages
 * stagger-flip from right to left using rotateY + perspective, then
 * reset simultaneously. Pure Animated.View — no SVG.
 *
 * Fabric safety: transformOrigin with array syntax + rotateY is used.
 * If transformOrigin doesn't cooperate with rotateY on a specific
 * Fabric build, the fallback is translate-rotate-translate.
 */
export function BookPageFlipAnimation({
  size = 120,
  color = '#8b5cf6',
  testID,
}: BookPageFlipAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  const page1 = useSharedValue(0);
  const page2 = useSharedValue(0);
  const page3 = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;

    const easing = Easing.inOut(Easing.ease);

    function buildFlipSequence(
      staggerDelay: number
    ): ReturnType<typeof withRepeat> {
      return withRepeat(
        withSequence(
          withDelay(
            staggerDelay,
            withTiming(-180, { duration: PAGE_FLIP_MS, easing })
          ),
          withDelay(
            2 * STAGGER_MS - staggerDelay + PAUSE_MS,
            withTiming(-180, { duration: 0 })
          ),
          withTiming(0, { duration: RESET_MS }),
          withDelay(PAUSE_MS, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
    }

    page1.value = buildFlipSequence(0) as number;
    page2.value = buildFlipSequence(STAGGER_MS) as number;
    page3.value = buildFlipSequence(STAGGER_MS * 2) as number;

    return () => {
      cancelAnimation(page1);
      cancelAnimation(page2);
      cancelAnimation(page3);
    };
  }, [reduceMotion, page1, page2, page3]);

  const scale = size / 120;
  const bookY = 25 * scale;
  const bookH = 70 * scale;
  const spineX = 60 * scale;
  const leftX = 12 * scale;
  const leftW = 44 * scale;
  const rightX = 64 * scale;
  const rightW = 44 * scale;
  const pageInset = 4 * scale;
  const pageX = spineX + pageInset;
  const pageY = bookY + pageInset;
  const pageW = rightW - pageInset * 2;
  const pageH = bookH - pageInset * 2;

  function usePageStyle(sv: { value: number }) {
    return useAnimatedStyle(() => {
      const deg = sv.value;
      // At -90deg the page is edge-on: swap to "back" appearance
      // Elevation increases mid-flip for depth
      const midFlip = Math.abs(deg) > 45 && Math.abs(deg) < 135;
      return {
        transform: [{ perspective: 800 }, { rotateY: `${deg}deg` }],
        transformOrigin: ['0%', '50%', 0],
        elevation: midFlip ? 4 : 0,
      };
    });
  }

  const page1Style = usePageStyle(page1);
  const page2Style = usePageStyle(page2);
  const page3Style = usePageStyle(page3);

  return (
    <View
      testID={testID}
      accessibilityLabel="Loading content"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Left cover */}
      <View
        style={{
          position: 'absolute',
          left: leftX,
          top: bookY,
          width: leftW,
          height: bookH,
          borderRadius: 3 * scale,
          backgroundColor: color,
          opacity: COVER_OPACITY,
        }}
      />

      {/* Right cover */}
      <View
        style={{
          position: 'absolute',
          left: rightX,
          top: bookY,
          width: rightW,
          height: bookH,
          borderRadius: 3 * scale,
          backgroundColor: color,
          opacity: COVER_OPACITY,
        }}
      />

      {/* Page 1 — rotateY flips around the left (spine) edge via transformOrigin */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pageX,
            top: pageY,
            width: pageW,
            height: pageH,
            borderRadius: 1 * scale,
            backgroundColor: color,
            opacity: PAGE_OPACITY,
            backfaceVisibility: 'hidden',
          },
          page1Style,
        ]}
      />

      {/* Page 2 */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pageX + 2 * scale,
            top: pageY,
            width: pageW - 2 * scale,
            height: pageH,
            borderRadius: 1 * scale,
            backgroundColor: color,
            opacity: PAGE_OPACITY * 0.8,
            backfaceVisibility: 'hidden',
          },
          page2Style,
        ]}
      />

      {/* Page 3 */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pageX + 4 * scale,
            top: pageY,
            width: pageW - 4 * scale,
            height: pageH,
            borderRadius: 1 * scale,
            backgroundColor: color,
            opacity: PAGE_OPACITY * 0.6,
            backfaceVisibility: 'hidden',
          },
          page3Style,
        ]}
      />

      {/* Spine line */}
      <View
        style={{
          position: 'absolute',
          left: spineX - 1 * scale,
          top: bookY,
          width: 2 * scale,
          height: bookH,
          backgroundColor: color,
          opacity: SPINE_OPACITY,
        }}
      />
    </View>
  );
}
```

- [ ] **Step 4: Run all BookPageFlipAnimation tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/BookPageFlipAnimation.test.tsx --no-coverage`

Expected: all tests PASS (including existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/common/BookPageFlipAnimation.tsx apps/mobile/src/components/common/BookPageFlipAnimation.test.tsx
git commit -m "feat(mobile): 3D perspective book page-flip animation [ANIM-IMPROVE]"
```

---

### Task 4: BrandCelebration + CelebrationAnimation — Fabric Fallback

**Files:**
- Patch: `apps/mobile/src/components/common/BrandCelebration.tsx`
- Patch: `apps/mobile/src/components/common/CelebrationAnimation.tsx`

- [ ] **Step 1: Add Fabric fallback to BrandCelebration**

In `apps/mobile/src/components/common/BrandCelebration.tsx`, add a second `useEffect` after the existing animation `useEffect`. Search for `}, [done, reduceMotion]);` to find the insertion point:

```tsx
  // Fabric safety net: if AnimatedCircle prop updates didn't fire after 500ms
  // (cold start, JS thread busy, Fabric native module init delay), jump to
  // final static state so the celebration is always visible. 500ms is generous
  // enough to avoid false positives on slow devices while still well within
  // the 700ms animation window.
  useEffect(() => {
    if (reduceMotion) return;
    const fallback = setTimeout(() => {
      if (studentR.value < 0.1) {
        studentR.value = 15;
        studentInR.value = 6.5;
        dot1R.value = 4;
        dot2R.value = 5;
        dot3R.value = 6;
        mentorR.value = 17;
        mentorInR.value = 7;
        ringOp.value = 0.18;
        pathDraw.value = 1;
        happyBounce.value = 1;
      }
    }, 500);
    return () => clearTimeout(fallback);
  }, [reduceMotion, studentR, studentInR, dot1R, dot2R, dot3R, mentorR, mentorInR, ringOp, pathDraw, happyBounce]);
```

- [ ] **Step 2: Add Fabric fallback to CelebrationAnimation**

In `apps/mobile/src/components/common/CelebrationAnimation.tsx`, add a second `useEffect` after the existing animation `useEffect`. Search for `}, [reduceMotion, progress, opacity, centerScale]);` to find the insertion point:

```tsx
  // Fabric safety net: same rationale as BrandCelebration (see above).
  useEffect(() => {
    if (reduceMotion) return;
    const fallback = setTimeout(() => {
      if (progress.value < 0.1) {
        progress.value = 1;
        centerScale.value = 1;
        opacity.value = 0; // already faded = done
        onCompleteRef.current?.();
      }
    }, 500);
    return () => clearTimeout(fallback);
  }, [reduceMotion, progress, centerScale, opacity]);
```

- [ ] **Step 3: Run existing tests to ensure no regressions**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/BrandCelebration.tsx src/components/common/CelebrationAnimation.tsx --no-coverage`

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/common/BrandCelebration.tsx apps/mobile/src/components/common/CelebrationAnimation.tsx
git commit -m "fix(mobile): add 300ms Fabric fallback timer to celebrations [ANIM-IMPROVE]"
```

---

### Task 5: Wire Animations in ChatShell

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx`
- Modify: `apps/mobile/src/components/session/ChatShell.test.tsx`

- [ ] **Step 1: Update ChatShell imports and animation blocks**

In `apps/mobile/src/components/session/ChatShell.tsx`:

**Replace import** — search for `import { PenWritingAnimation } from '../common';`:
```tsx
import { PenWritingAnimation } from '../common';
```
with:
```tsx
import { LightBulbAnimation, MagicPenAnimation } from '../common';
import { FadeOut } from 'react-native-reanimated';
```

**Add the LightBulb block.** Search for `{showIdleAnim &&` and add this block directly above it:

```tsx
        {isStreaming && (
          <View className="items-center py-4" testID="thinking-bulb-animation">
            <LightBulbAnimation size={48} color={colors.muted} />
          </View>
        )}
```

**Replace the `showIdleAnim` block** (the existing `PenWritingAnimation` block):

Replace:
```tsx
        {showIdleAnim && (
          <View className="items-center py-4" testID="idle-pen-animation">
            <PenWritingAnimation size={48} color={colors.muted} />
          </View>
        )}
```
with:
```tsx
        {showIdleAnim && (
          <Animated.View
            className="items-center py-4"
            testID="idle-pen-animation"
            exiting={FadeOut.duration(200)}
          >
            <MagicPenAnimation size={48} color={colors.muted} />
          </Animated.View>
        )}
```

Note: `Animated` is already imported from `react-native-reanimated` in the file. `Animated.View` from reanimated is already available (the test-setup mock provides it).

**Update the idle timer comment** — search for `// --- Idle "pen writing" animation ---`:

Replace:
```tsx
  // --- Idle "pen writing" animation ---
  // Show a gentle pen animation after 20s of silence when the AI has finished
```
with:
```tsx
  // --- Idle "magic pen" animation ---
  // Show a gentle pen animation after idle timeout when the AI has finished
  // speaking and the student hasn't responded. Threshold is a tuning candidate
  // (consider 12-15s for younger users). Resets on any user input.
```

- [ ] **Step 2: Update ChatShell test mock**

In `apps/mobile/src/components/session/ChatShell.test.tsx`, search for `PenWritingAnimation: () => null` and replace the enclosing mock:

```tsx
jest.mock('../common', () => ({
  PenWritingAnimation: () => null,
}));
```

with:

```tsx
jest.mock('../common', () => ({
  LightBulbAnimation: () => null,
  MagicPenAnimation: () => null,
}));
```

- [ ] **Step 3: Add ChatShell behavioral wiring tests**

Add to the bottom of `apps/mobile/src/components/session/ChatShell.test.tsx`:

```tsx
describe('animation wiring (ANIM-IMPROVE)', () => {
  it('shows LightBulbAnimation when streaming', () => {
    renderChatShell({ isStreaming: true });
    expect(screen.getByTestId('thinking-bulb-animation')).toBeTruthy();
    expect(screen.queryByTestId('idle-pen-animation')).toBeNull();
  });

  it('does not show animations during normal conversation', () => {
    renderChatShell({ isStreaming: false });
    expect(screen.queryByTestId('thinking-bulb-animation')).toBeNull();
    expect(screen.queryByTestId('idle-pen-animation')).toBeNull();
  });
});
```

Note: The idle timer test (20s timeout → MagicPen) requires `jest.useFakeTimers()` and advancing 20s. That's a heavier test; the conditional rendering is already covered by the existing `showIdleAnim` state logic + the two tests above.

- [ ] **Step 4: Run ChatShell tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/ChatShell.test.tsx --no-coverage`

Expected: all tests PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/session/ChatShell.tsx apps/mobile/src/components/session/ChatShell.test.tsx
git commit -m "feat(mobile): wire LightBulb + MagicPen in ChatShell with FadeOut exit [ANIM-IMPROVE]"
```

---

### Task 6: Update Call Sites — Book, Library, Session Summary

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx`
- Modify: `apps/mobile/src/app/(app)/library.tsx`
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx`

- [ ] **Step 1: Update book topic loading screen**

In `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`:

**Replace import** — search for `import { PenWritingAnimation } from '../../../../../components/common';`:
```tsx
import { PenWritingAnimation } from '../../../../../components/common';
```
with:
```tsx
import { MagicPenAnimation } from '../../../../../components/common';
```

**Replace usage** — search for `<PenWritingAnimation size={100}`:
```tsx
        <PenWritingAnimation size={100} color={themeColors.accent} />
```
with:
```tsx
        <MagicPenAnimation size={100} color={themeColors.accent} />
```

- [ ] **Step 2: Update book test mock**

In `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx`, replace (lines 160-163):

```tsx
// --- PenWritingAnimation (simple stub) ---
jest.mock('../../../../../components/common', () => ({
  PenWritingAnimation: () => null,
}));
```

with:

```tsx
// --- MagicPenAnimation (simple stub) ---
jest.mock('../../../../../components/common', () => ({
  MagicPenAnimation: () => null,
}));
```

- [ ] **Step 3: Bump BrandCelebration size in library**

In `apps/mobile/src/app/(app)/library.tsx`, search for `<BrandCelebration size={36}` in the curriculum-complete section:

```tsx
                  <BrandCelebration size={36} />
```

with:

```tsx
                  <BrandCelebration size={56} />
```

- [ ] **Step 4: Bump BrandCelebration size in session summary**

In `apps/mobile/src/app/session-summary/[sessionId].tsx`, search for `<BrandCelebration size={36}`:

```tsx
          <BrandCelebration size={36} />
```

with:

```tsx
          <BrandCelebration size={56} />
```

- [ ] **Step 5: Run related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/shelf/[subjectId]/book/[bookId].tsx" --no-coverage`

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/library.tsx" --no-coverage`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx" "apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx" "apps/mobile/src/app/(app)/library.tsx" "apps/mobile/src/app/session-summary/[sessionId].tsx"
git commit -m "feat(mobile): wire MagicPen in book, bump celebration size 36→56 [ANIM-IMPROVE]"
```

---

### Task 7: Barrel Exports + Delete PenWritingAnimation

**Why this is Task 7 (not earlier):** Tasks 5 and 6 wire the new components into all consumer files first. Only after all consumers are updated is it safe to delete the old files. This prevents broken intermediate states.

**Files:**
- Modify: `apps/mobile/src/components/common/index.ts`
- Delete: `apps/mobile/src/components/common/PenWritingAnimation.tsx`
- Delete: `apps/mobile/src/components/common/PenWritingAnimation.test.tsx`

- [ ] **Step 1: Update barrel exports**

In `apps/mobile/src/components/common/index.ts`, replace:

```ts
export { PenWritingAnimation } from './PenWritingAnimation';
```

with:

```ts
export { LightBulbAnimation } from './LightBulbAnimation';
export { MagicPenAnimation } from './MagicPenAnimation';
```

- [ ] **Step 2: Delete old PenWritingAnimation files**

```bash
git rm apps/mobile/src/components/common/PenWritingAnimation.tsx apps/mobile/src/components/common/PenWritingAnimation.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/common/index.ts
git commit -m "refactor(mobile): replace PenWritingAnimation exports with LightBulb + MagicPen [ANIM-IMPROVE]"
```

---

### Task 8: Typecheck + Lint Verification

**Files:** None (verification only)

- [ ] **Step 1: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: no errors. If errors appear, fix them before proceeding.

- [ ] **Step 2: Run mobile lint**

Run: `pnpm exec nx lint mobile`

Expected: no errors.

- [ ] **Step 3: Run all animation-related tests together**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/common/LightBulbAnimation.tsx src/components/common/MagicPenAnimation.tsx src/components/common/BookPageFlipAnimation.tsx src/components/common/BrandCelebration.tsx src/components/common/CelebrationAnimation.tsx src/components/session/ChatShell.tsx --no-coverage`

Expected: all PASS.

- [ ] **Step 4: Final commit if any lint/type fixes were needed**

```bash
git add -A
git commit -m "fix(mobile): resolve lint/type issues from animation improvements [ANIM-IMPROVE]"
```

---

## Follow-Up: Visual Regression Testing

Unit tests confirm "it renders" but not "it looks right." SVG path typos, layout miscalculations, or transform bugs only surface visually. After implementation, add one Maestro screenshot assertion per animation at its primary size:

- `LightBulbAnimation` at 48px
- `MagicPenAnimation` at 100px
- `BookPageFlipAnimation` at 80px
- `BrandCelebration` at 56px

This is a follow-up task, not a blocker for the implementation — but should be done before shipping to production.
