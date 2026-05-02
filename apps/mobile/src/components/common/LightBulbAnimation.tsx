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
import Svg, { Path, Line } from 'react-native-svg';

// ─── Design tokens ───────────────────────────────────────────────────────────
// Warm amber for filament and glow
const AMBER = '#fbbf24';
// Slightly cooler amber for filament mid-tone (gives depth)
const AMBER_DIM = '#d97706';

// ─── Bulb geometry (viewBox 0 0 64 80) ──────────────────────────────────────
//
// Vintage pear-shaped incandescent bulb:
//   - Rounded glass dome  (top, wider)
//   - Pinch / neck region (narrowing)
//   - Screw base          (trapezoid + 3 thread ridges + mounting cap dot)
//   - Filament squiggle   (stroke path, 2-3 loops inside glass)
//   - Glass highlight     (small white ellipse, upper-left, low opacity)
//
// ViewBox is 64 wide × 80 tall — bulb occupies roughly 60% of height,
// screw base the remaining 40%.  A 1:1.25 aspect ratio at a 64×80 viewBox
// keeps proportions on small sizes without distorting at 96px.

// Glass dome — pear silhouette.  Two cubic beziers form the outer profile;
// a flat bottom closes the neck.  Drawn CW so fill is correct.
const GLASS = [
  'M 32 4',
  'C 10 4, 4 22, 4 34', // left arc: top → widest waist
  'C 4 48, 16 58, 22 60', // left arc: waist → neck
  'L 42 60', // bottom of glass (neck line, connects both sides)
  'C 48 58, 60 48, 60 34', // right arc: neck → waist (mirrored)
  'C 60 22, 54 4, 32 4', // right arc: waist → top
  'Z',
].join(' ');

// Filament: a curly squiggle inside the glass (2.5 loops).
// Written so it sits visually in the lower-middle of the glass dome.
const FILAMENT =
  'M 22 44 C 24 38, 28 38, 32 42 C 36 46, 40 46, 42 40 C 44 34, 40 30, 36 34';

// Screw base — trapezoid body (wider at top, narrower at bottom)
const BASE_BODY = 'M 22 60 L 42 60 L 39 72 L 25 72 Z';

// Three horizontal thread ridges across the base
const RIDGE_Y = [63, 67, 71];
const RIDGE_X1 = 23; // left edge (approximate, stays inside base silhouette)
const RIDGE_X2 = 41;

// Mounting cap — small rectangle/dot at the very bottom of the screw
const CAP = 'M 27 72 L 37 72 L 37 76 L 27 76 Z';

// Glass highlight — small white oval (Path-drawn ellipse), upper-left of dome,
// reads as 3D glass.  Drawn as an SVG arc path so we avoid importing Ellipse
// which is not reliably available in the jest SVG mock environment.
// Ellipse center (20, 18), rx=5, ry=3.
// Arc path: start at (cx-rx, cy), arc to (cx+rx, cy) and back.
const HIGHLIGHT_PATH = 'M 15 18 A 5 3 0 0 1 25 18 A 5 3 0 0 1 15 18 Z';

// ─── Types ───────────────────────────────────────────────────────────────────

type LightBulbAnimationProps = {
  /** Overall size in pixels — default 64 */
  size?: number;
  /** Outline / structural color (theme muted by default in consumer) */
  color?: string;
  testID?: string;
};

// ─── Timing constants ────────────────────────────────────────────────────────

// Base filament pulse: one slow sine period
const PULSE_BASE_MS = 1200;
// Secondary modulating wave (longer period → irregular feel)
const PULSE_MOD_MS = 2700;
// "Idea!" flash: bright spike — duration of the bright phase
const FLASH_ON_MS = 120;
// "Idea!" flash: decay back to normal
const FLASH_OFF_MS = 400;
// Gap between idea flashes — minimum quiet period
const FLASH_GAP_MS = 1800;
// Side-to-side sway period
const SWAY_MS = 1500;
// Glow halo breathing period (matches base pulse for visual coherence)
const GLOW_MS = PULSE_BASE_MS;

/**
 * LightBulbAnimation
 *
 * A vintage incandescent bulb that "thinks" visually:
 *   - Amber filament pulses irregularly (two overlapping waves)
 *   - Warm glow halo breathes in/out behind the SVG
 *   - Occasional "idea!" brightness flash
 *   - Gentle whole-bulb sway as if hanging on a cord
 *
 * Fabric-safe: no AnimatedG with x/y; glow is a separate Animated.View
 * behind the SVG; filament uses animated opacity via useAnimatedStyle on
 * an Animated.View wrapping the SVG layer.
 *
 * Reduced motion: static fully-lit bulb.  No pulsing, no sway, no flashes.
 */
export function LightBulbAnimation({
  size = 64,
  color = '#9ca3af',
  testID,
}: LightBulbAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  // ── Shared values ──────────────────────────────────────────────────────────

  // Filament opacity: base wave (0→1 normalized)
  const filamentBase = useSharedValue(reduceMotion ? 0.85 : 0.4);
  // Secondary modulating wave (0→1 normalized)
  const filamentMod = useSharedValue(reduceMotion ? 1 : 0.5);
  // "Idea!" flash multiplier (1 = normal, spikes briefly above 1 → clamp in style)
  const ideaFlash = useSharedValue(1);
  // Glow opacity
  const glowOp = useSharedValue(reduceMotion ? 0.38 : 0.25);
  // Glow scale
  const glowScale = useSharedValue(reduceMotion ? 1 : 0.92);
  // Sway rotation (degrees)
  const swayDeg = useSharedValue(0);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (reduceMotion) {
      // Static fully-lit state — no animation loops
      filamentBase.value = 0.85;
      filamentMod.value = 1;
      ideaFlash.value = 1;
      glowOp.value = 0.38;
      glowScale.value = 1;
      swayDeg.value = 0;
      return;
    }

    // Base filament pulse: slow sine-like oscillation
    filamentBase.value = withRepeat(
      withSequence(
        withTiming(0.85, {
          duration: PULSE_BASE_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.35, {
          duration: PULSE_BASE_MS / 2,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      false
    );

    // Secondary modulating wave (different period → irregular envelope)
    filamentMod.value = withRepeat(
      withSequence(
        withTiming(1.0, {
          duration: PULSE_MOD_MS / 2,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0.55, {
          duration: PULSE_MOD_MS / 2,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      false
    );

    // "Idea!" flash: bright spike every ~2-3 seconds
    // withDelay at start ensures the first flash comes after a quiet lead-in.
    ideaFlash.value = withRepeat(
      withSequence(
        withDelay(
          FLASH_GAP_MS,
          withTiming(1.4, {
            duration: FLASH_ON_MS,
            easing: Easing.out(Easing.ease),
          })
        ),
        withTiming(1.0, {
          duration: FLASH_OFF_MS,
          easing: Easing.in(Easing.ease),
        })
      ),
      -1,
      false
    );

    // Glow: breathes in/out in sync with base pulse (not just fades up)
    glowOp.value = withRepeat(
      withSequence(
        withTiming(0.5, {
          duration: GLOW_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.25, {
          duration: GLOW_MS / 2,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      false
    );

    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.08, {
          duration: GLOW_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.92, {
          duration: GLOW_MS / 2,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      false
    );

    // Sway: gentle pendulum ±2deg, 1500ms period
    swayDeg.value = withRepeat(
      withSequence(
        withTiming(2, {
          duration: SWAY_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(-2, {
          duration: SWAY_MS / 2,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(filamentBase);
      cancelAnimation(filamentMod);
      cancelAnimation(ideaFlash);
      cancelAnimation(glowOp);
      cancelAnimation(glowScale);
      cancelAnimation(swayDeg);
    };
  }, [
    reduceMotion,
    filamentBase,
    filamentMod,
    ideaFlash,
    glowOp,
    glowScale,
    swayDeg,
  ]);

  // ── Animated styles ────────────────────────────────────────────────────────

  // Glow halo behind the SVG
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
    transform: [{ scale: glowScale.value }],
  }));

  // Whole-bulb container: carries the sway rotation
  const swayStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${swayDeg.value}deg` }],
  }));

  // Filament opacity: product of base × mod × ideaFlash, clamped [0,1]
  const filamentStyle = useAnimatedStyle(() => {
    const raw = filamentBase.value * filamentMod.value * ideaFlash.value;
    return {
      opacity: Math.min(1, raw),
    };
  });

  // ── Layout ────────────────────────────────────────────────────────────────

  // The viewBox is 64×80.  We render the SVG at viewBox native units and
  // scale the outer container to `size`.  This keeps proportions correct
  // and avoids a non-square viewBox vs. square `size` mismatch.
  const svgW = size;
  const svgH = Math.round(size * (80 / 64)); // maintain 64:80 aspect

  // Glow halo: a warm oval behind the glass dome portion
  const glowW = size * 0.9;
  const glowH = size * 0.85;
  const glowLeft = (size - glowW) / 2;
  const glowTop = size * 0.02;

  return (
    <View
      testID={testID}
      accessibilityLabel="Thinking"
      accessibilityRole="image"
      style={{ width: size, height: svgH, alignItems: 'center' }}
    >
      {/* Warm glow halo — Animated.View BEHIND the SVG (Fabric-safe) */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: glowW,
            height: glowH,
            borderRadius: glowH / 2,
            backgroundColor: AMBER,
            left: glowLeft,
            top: glowTop,
          },
          glowStyle,
          { pointerEvents: 'none' },
        ]}
      />

      {/* Whole-bulb sway container */}
      <Animated.View style={[swayStyle, { pointerEvents: 'none' }]}>
        {/* Static SVG: glass silhouette, screw base, glass highlight */}
        <Svg width={svgW} height={svgH} viewBox="0 0 64 80">
          {/* Glass dome — filled with very low-opacity amber to suggest glow */}
          <Path
            d={GLASS}
            fill={AMBER}
            fillOpacity={0.08}
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {/* Screw base body */}
          <Path
            d={BASE_BODY}
            fill={color}
            fillOpacity={0.55}
            stroke={color}
            strokeWidth={1}
            strokeLinejoin="round"
          />

          {/* Thread ridges */}
          {RIDGE_Y.map((y) => (
            <Line
              key={y}
              x1={RIDGE_X1}
              y1={y}
              x2={RIDGE_X2}
              y2={y}
              stroke={color}
              strokeWidth={0.8}
              opacity={0.5}
            />
          ))}

          {/* Mounting cap at bottom */}
          <Path
            d={CAP}
            fill={color}
            fillOpacity={0.7}
            stroke={color}
            strokeWidth={0.8}
          />

          {/* Glass highlight — reads as 3D glass, not a flat egg */}
          <Path d={HIGHLIGHT_PATH} fill="#ffffff" opacity={0.22} />
        </Svg>

        {/* Filament layer — separate Animated.View for opacity animation.
            Fabric-safe: no AnimatedG with x/y props. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: svgW,
              height: svgH,
            },
            filamentStyle,
            { pointerEvents: 'none' },
          ]}
        >
          <Svg width={svgW} height={svgH} viewBox="0 0 64 80">
            {/* Filament glow halo — soft wide stroke behind the filament */}
            <Path
              d={FILAMENT}
              fill="none"
              stroke={AMBER}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.25}
            />
            {/* Filament core — warm amber squiggle, clearly readable as wire */}
            <Path
              d={FILAMENT}
              fill="none"
              stroke={AMBER}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Filament core highlight — lighter center to sell the "hot wire" look */}
            <Path
              d={FILAMENT}
              fill="none"
              stroke={AMBER_DIM}
              strokeWidth={0.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
