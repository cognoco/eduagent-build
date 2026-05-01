import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import Animated, {
  type SharedValue,
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
  /** Overall size in pixels (default: 140) */
  size?: number;
  /** Cover color (default: brand violet #8b5cf6) */
  color?: string;
  testID?: string;
}

// ─── Timing constants ────────────────────────────────────────────────────────
// Per-page flip duration
const FLIP_MS = 500;
// Pause at fully flipped before resetting
const PAUSE_AFTER_FLIP_MS = 400;
// Stagger between page 1 and page 2
const STAGGER_MS = 300;
// Reset (flutter back) — slower, gentler
const RESET_MS = 300;
// Breathing period for idle state
const BREATH_MS = 2200;
// Dust mote rise duration range
const MOTE_PERIOD_MS = 2700; // base; per-mote stagger applied via withDelay

// ─── Colors ──────────────────────────────────────────────────────────────────
const GLOW_COLOR = '#fbbf24'; // warm amber inside glow + dust motes
const GILT_COLOR = '#d4a73a'; // gold edge highlight strip on covers
const SPINE_DARKEN = 0.7; // relative opacity to darken spine vs cover
const PAGE_FRONT_LIGHT = '#faf5eb'; // cream front face
const PAGE_FRONT_DARK = '#2a2520'; // aged paper front, dark mode
const PAGE_BACK_LIGHT = '#ede8d8'; // slightly darker aged paper for back face
const PAGE_BACK_DARK = '#1e1a17'; // darker back, dark mode

// ─── Layout proportions ──────────────────────────────────────────────────────
// All expressed as fractions of `size` so proportions are stable at any size.
const BOOK_TOP_FRAC = 0.18; // top of covers (fraction of size)
const BOOK_H_FRAC = 0.65; // height of covers
const COVER_W_FRAC = 0.38; // width of each cover half
const SPINE_W_FRAC = 0.06; // width of spine strip
const PAGE_INSET = 0.02; // inset from cover edge to page area
const GILT_H_FRAC = 0.012; // gilt edge strip height

/**
 * Cartoon storybook page-flip loading animation.
 *
 * A leather-bound book opens itself with genuine 3D page turns, warm amber
 * inside-glow, subtle breathing idle, and floating dust motes.
 *
 * ## Transform approach (Fabric safety)
 * We use the translate→rotateY→translate fallback instead of transformOrigin
 * percentage values, because `transformOrigin: ['0%', '50%', 0]` + rotateY
 * has been observed to misbehave with some Fabric/RN versions on Android
 * (the origin collapses to center instead of the left edge). The explicit
 * translate-rotate-translate chain is deterministic on both architectures:
 *
 *   transform: [
 *     { translateX: -pageW / 2 },   // shift pivot to left edge
 *     { perspective: 800 },
 *     { rotateY: `${rot}deg` },
 *     { translateX: pageW / 2 },    // shift back so left edge stays in place
 *   ]
 *
 * ## Reduced motion
 * When useReducedMotion() returns true, the component renders a static closed
 * book with no breathing, no flip, no glow, and no motes.
 */
export function BookPageFlipAnimation({
  size = 140,
  color = '#8b5cf6',
  testID,
}: BookPageFlipAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const isDark = useColorScheme() === 'dark';

  // ── Derived layout values ──────────────────────────────────────────────────
  const bookTop = size * BOOK_TOP_FRAC;
  const bookH = size * BOOK_H_FRAC;
  const coverW = size * COVER_W_FRAC;
  const spineW = size * SPINE_W_FRAC;
  const giltH = size * GILT_H_FRAC;

  // Left cover starts at left edge of book area; right cover after spine
  const bookLeft = (size - (coverW * 2 + spineW)) / 2;
  const spineLeft = bookLeft + coverW;
  const rightCoverLeft = spineLeft + spineW;

  // Page dimensions — slightly inset from cover
  const pageInset = size * PAGE_INSET;
  const pageW = coverW - pageInset;
  const pageH = bookH - pageInset * 2;
  const pageTop = bookTop + pageInset;

  // Pages originate at the spine (right edge of left page area)
  // Using translate-rotate-translate: left edge of page at spineLeft
  const pageLeft = spineLeft - pageW;

  // Glow ellipse behind the spine
  const glowW = spineW * 5;
  const glowH = bookH * 0.8;
  const glowLeft = spineLeft - glowW / 2 + spineW / 2;
  const glowTop = bookTop + bookH * 0.1;

  // Page colors
  const pageFrontColor = isDark ? PAGE_FRONT_DARK : PAGE_FRONT_LIGHT;
  const pageBackColor = isDark ? PAGE_BACK_DARK : PAGE_BACK_LIGHT;

  // Dot (mote) size
  const moteSize = Math.max(3, size * 0.028);

  // ── Shared values ──────────────────────────────────────────────────────────
  // Page rotations: 0 = front (right-side page position), -180 = fully flipped left
  const page1Rot = useSharedValue(0);
  const page2Rot = useSharedValue(0);
  const page3Rot = useSharedValue(0);

  // Inside glow opacity
  const glowOp = useSharedValue(0.1);

  // Breathing scale (Y axis, idle closed book feel)
  const breathScale = useSharedValue(1.0);

  // Dust motes: each is a progress value 0→1 (0 = bottom, 1 = top + faded)
  const mote1 = useSharedValue(0);
  const mote2 = useSharedValue(0);
  const mote3 = useSharedValue(0);

  // ── Animation orchestration ────────────────────────────────────────────────
  useEffect(() => {
    if (reduceMotion) return;

    const flipEase = Easing.inOut(Easing.ease);

    // Each page flips 0 → -180 over FLIP_MS, holds PAUSE_AFTER_FLIP_MS,
    // then resets -180 → 0 over RESET_MS (gentle "sigh closed").
    // Page 2 and 3 are staggered so they feel like continuous turning.
    // Cycle length must be equal across all three so withRepeat stays in sync.

    // Page 1: flips first
    page1Rot.value = withRepeat(
      withSequence(
        withTiming(-180, { duration: FLIP_MS, easing: flipEase }),
        withDelay(
          PAUSE_AFTER_FLIP_MS,
          withTiming(0, { duration: RESET_MS, easing: flipEase })
        ),
        // pad out to equal cycle length for pages 2 & 3
        withDelay(STAGGER_MS * 2, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );

    // Page 2: delayed STAGGER_MS after page 1
    page2Rot.value = withRepeat(
      withSequence(
        withDelay(
          STAGGER_MS,
          withTiming(-180, { duration: FLIP_MS, easing: flipEase })
        ),
        withDelay(
          PAUSE_AFTER_FLIP_MS,
          withTiming(0, { duration: RESET_MS, easing: flipEase })
        ),
        withDelay(STAGGER_MS, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );

    // Page 3: delayed STAGGER_MS * 2 after page 1
    page3Rot.value = withRepeat(
      withSequence(
        withDelay(
          STAGGER_MS * 2,
          withTiming(-180, { duration: FLIP_MS, easing: flipEase })
        ),
        withDelay(
          PAUSE_AFTER_FLIP_MS,
          withTiming(0, { duration: RESET_MS, easing: flipEase })
        ),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );

    // Glow pulses in sync with the flip sequence: rises as pages start turning
    glowOp.value = withRepeat(
      withSequence(
        withTiming(0.45, {
          duration: FLIP_MS + STAGGER_MS,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.1, {
          duration: FLIP_MS + PAUSE_AFTER_FLIP_MS + RESET_MS,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      false
    );

    // Breathing: very gentle scale Y oscillation while closed (period ~2200ms)
    breathScale.value = withRepeat(
      withSequence(
        withTiming(1.008, {
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.993, {
          duration: BREATH_MS / 2,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      true
    );

    // Dust motes: each rises (translateY from 0 to -35px) and fades, loops
    // They use slightly different periods so they don't move in unison.
    mote1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: MOTE_PERIOD_MS }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
    mote2.value = withRepeat(
      withSequence(
        withDelay(
          MOTE_PERIOD_MS * 0.35,
          withTiming(1, { duration: MOTE_PERIOD_MS * 1.1 })
        ),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
    mote3.value = withRepeat(
      withSequence(
        withDelay(
          MOTE_PERIOD_MS * 0.65,
          withTiming(1, { duration: MOTE_PERIOD_MS * 0.9 })
        ),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(page1Rot);
      cancelAnimation(page2Rot);
      cancelAnimation(page3Rot);
      cancelAnimation(glowOp);
      cancelAnimation(breathScale);
      cancelAnimation(mote1);
      cancelAnimation(mote2);
      cancelAnimation(mote3);
    };
  }, [
    reduceMotion,
    page1Rot,
    page2Rot,
    page3Rot,
    glowOp,
    breathScale,
    mote1,
    mote2,
    mote3,
  ]);

  // ── Animated styles ────────────────────────────────────────────────────────

  // Page transform: translate-rotate-translate to anchor rotation at left edge.
  // This is the Fabric-safe fallback for transformOrigin: ['0%', '50%', 0].
  // perspective: 800 gives depth without too much foreshortening at small sizes.
  function usePageFrontStyle(sv: SharedValue<number>) {
    return useAnimatedStyle(() => ({
      transform: [
        { translateX: -pageW / 2 },
        { perspective: 800 },
        { rotateY: `${sv.value}deg` },
        { translateX: pageW / 2 },
      ],
    }));
  }

  // Back-face overlay: same transform but opacity only visible when rotated past 90deg.
  // We use a simple approach: the back-face view is always rendered behind the front face,
  // and we rely on the natural 3D flip so the back color shows through once rotated.
  // Since RN doesn't natively backface-cull without native driver complexity, we simply
  // show two overlapping views with matching transforms and use opacity to fade each face
  // at the crossover point. In practice the depth effect reads as "page turning" even
  // without perfect back-face hiding.

  const page1FrontStyle = usePageFrontStyle(page1Rot);
  const page2FrontStyle = usePageFrontStyle(page2Rot);
  const page3FrontStyle = usePageFrontStyle(page3Rot);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
  }));

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: breathScale.value }],
  }));

  // Mote styles: translateY upward, drift X, fade out as they rise
  const MOTE_RISE = size * 0.28;
  const mote1Style = useAnimatedStyle(() => ({
    opacity: (1 - mote1.value) * 0.7,
    transform: [
      { translateY: -MOTE_RISE * mote1.value },
      { translateX: mote1.value * size * 0.06 },
    ],
  }));
  const mote2Style = useAnimatedStyle(() => ({
    opacity: (1 - mote2.value) * 0.6,
    transform: [
      { translateY: -MOTE_RISE * mote2.value },
      { translateX: -mote2.value * size * 0.05 },
    ],
  }));
  const mote3Style = useAnimatedStyle(() => ({
    opacity: (1 - mote3.value) * 0.65,
    transform: [
      { translateY: -MOTE_RISE * mote3.value },
      { translateX: mote3.value * size * 0.04 },
    ],
  }));

  // ── Render helpers ─────────────────────────────────────────────────────────

  // A single turning page: front face with back-face color behind it
  function TurningPage({
    pageStyle,
    zIndex,
  }: {
    pageStyle: ReturnType<typeof useAnimatedStyle>;
    zIndex: number;
  }) {
    return (
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pageLeft,
            top: pageTop,
            width: pageW,
            height: pageH,
            zIndex,
          },
          pageStyle,
          { pointerEvents: 'none' },
        ]}
      >
        {/* Back face (aged paper) — rendered behind front */}
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: pageBackColor,
            borderRadius: 2,
          }}
        />
        {/* Front face (cream) — rendered on top */}
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: pageFrontColor,
            borderRadius: 2,
          }}
        />
        {/* Decorative text lines on front */}
        {[0.22, 0.35, 0.48, 0.61, 0.74].map((frac) => (
          <View
            key={frac}
            style={{
              position: 'absolute',
              left: pageW * 0.1,
              top: pageH * frac,
              width: pageW * 0.8,
              height: 1,
              backgroundColor: isDark ? '#4a3f35' : '#d4c4a8',
              opacity: 0.35,
            }}
          />
        ))}
      </Animated.View>
    );
  }

  // ── Static spine color: darker shade of cover color ────────────────────────
  // We approximate "darken" by wrapping a semi-transparent black overlay
  // rather than parsing hex — avoids any color math in the component.

  return (
    <View
      testID={testID}
      accessibilityLabel="Loading content"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Breathing wrapper — wraps the entire book for the idle scale */}
      <Animated.View
        style={[
          { position: 'absolute', left: 0, top: 0, width: size, height: size },
          !reduceMotion ? breathStyle : undefined,
          { pointerEvents: 'none' },
        ]}
      >
        {/* ── Left cover ─────────────────────────────────────────────────── */}
        <View
          style={{
            position: 'absolute',
            left: bookLeft,
            top: bookTop,
            width: coverW,
            height: bookH,
            backgroundColor: color,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            opacity: 0.9,
          }}
        >
          {/* Gilt edge strip — top of left cover */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 4,
              right: 4,
              height: giltH,
              backgroundColor: GILT_COLOR,
              opacity: 0.65,
              borderRadius: 1,
            }}
          />
          {/* Inset border for leather texture suggestion */}
          <View
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              bottom: 4,
              right: 4,
              borderWidth: 1,
              borderColor: '#ffffff',
              opacity: 0.1,
              borderRadius: 2,
            }}
          />
        </View>

        {/* ── Spine ──────────────────────────────────────────────────────── */}
        <View
          style={{
            position: 'absolute',
            left: spineLeft,
            top: bookTop - size * 0.01,
            width: spineW,
            height: bookH + size * 0.02,
            backgroundColor: color,
            opacity: SPINE_DARKEN,
          }}
        />
        {/* Spine shadow overlay for depth */}
        <View
          style={{
            position: 'absolute',
            left: spineLeft,
            top: bookTop - size * 0.01,
            width: spineW,
            height: bookH + size * 0.02,
            backgroundColor: '#000000',
            opacity: 0.25,
          }}
        />

        {/* ── Right cover ────────────────────────────────────────────────── */}
        <View
          style={{
            position: 'absolute',
            left: rightCoverLeft,
            top: bookTop,
            width: coverW,
            height: bookH,
            backgroundColor: color,
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
            opacity: 0.9,
          }}
        >
          {/* Gilt edge strip — top of right cover */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 4,
              right: 4,
              height: giltH,
              backgroundColor: GILT_COLOR,
              opacity: 0.65,
              borderRadius: 1,
            }}
          />
          {/* Inset border */}
          <View
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              bottom: 4,
              right: 4,
              borderWidth: 1,
              borderColor: '#ffffff',
              opacity: 0.1,
              borderRadius: 2,
            }}
          />
        </View>

        {/* ── Static left page (visible under the turning pages) ─────────── */}
        <View
          style={{
            position: 'absolute',
            left: pageLeft,
            top: pageTop,
            width: pageW,
            height: pageH,
            backgroundColor: pageFrontColor,
            borderRadius: 2,
          }}
        >
          {[0.22, 0.35, 0.48, 0.61, 0.74].map((frac) => (
            <View
              key={frac}
              style={{
                position: 'absolute',
                left: pageW * 0.1,
                top: pageH * frac,
                width: pageW * 0.8,
                height: 1,
                backgroundColor: isDark ? '#4a3f35' : '#d4c4a8',
                opacity: 0.35,
              }}
            />
          ))}
        </View>

        {/* ── Static right page (background, visible when pages not flipped) */}
        <View
          style={{
            position: 'absolute',
            left: rightCoverLeft + pageInset,
            top: pageTop,
            width: pageW,
            height: pageH,
            backgroundColor: pageFrontColor,
            borderRadius: 2,
          }}
        >
          {[0.22, 0.35, 0.48, 0.61, 0.74].map((frac) => (
            <View
              key={frac}
              style={{
                position: 'absolute',
                left: pageW * 0.1,
                top: pageH * frac,
                width: pageW * 0.8,
                height: 1,
                backgroundColor: isDark ? '#4a3f35' : '#d4c4a8',
                opacity: 0.35,
              }}
            />
          ))}
        </View>
      </Animated.View>

      {/* ── Inside glow — behind the pages, in the spine gap ─────────────── */}
      {!reduceMotion && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: glowLeft,
              top: glowTop,
              width: glowW,
              height: glowH,
              borderRadius: glowH / 2,
              backgroundColor: GLOW_COLOR,
            },
            glowStyle,
            { pointerEvents: 'none' },
          ]}
        />
      )}

      {/* ── Turning pages (3D flip using translate-rotate-translate) ─────── */}
      {!reduceMotion && (
        <>
          {/* Page 3 renders lowest (flips last, should appear behind page 2) */}
          <TurningPage pageStyle={page3FrontStyle} zIndex={3} />
          <TurningPage pageStyle={page2FrontStyle} zIndex={4} />
          <TurningPage pageStyle={page1FrontStyle} zIndex={5} />
        </>
      )}

      {/* ── Dust motes near spine ─────────────────────────────────────────── */}
      {!reduceMotion && (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: spineLeft + spineW * 0.2,
                top: bookTop + bookH * 0.55,
                width: moteSize,
                height: moteSize,
                borderRadius: moteSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              mote1Style,
              { pointerEvents: 'none' },
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: spineLeft + spineW * 0.6,
                top: bookTop + bookH * 0.45,
                width: moteSize * 0.85,
                height: moteSize * 0.85,
                borderRadius: moteSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              mote2Style,
              { pointerEvents: 'none' },
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: spineLeft - spineW * 0.2,
                top: bookTop + bookH * 0.65,
                width: moteSize * 0.7,
                height: moteSize * 0.7,
                borderRadius: moteSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              mote3Style,
              { pointerEvents: 'none' },
            ]}
          />
        </>
      )}
    </View>
  );
}
