import { useEffect, useRef } from 'react';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, View } from 'react-native';
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
  type AnimatedProps,
} from 'react-native-reanimated';
import Svg, { Path, Rect, Line, Circle, Polygon } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Fabric-safe animated component setup
// Wrap in try-catch: on some Android release builds (Hermes + Fabric),
// createAnimatedComponent can throw on initialisation.
// ---------------------------------------------------------------------------
type AnimatedPathComponent = ComponentType<
  AnimatedProps<ComponentProps<typeof Path>>
>;
let AnimatedPath: AnimatedPathComponent;
try {
  AnimatedPath = Animated.createAnimatedComponent(
    Path
  ) as AnimatedPathComponent;
} catch {
  AnimatedPath = Path as unknown as AnimatedPathComponent;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
interface MagicPenAnimationProps {
  /** Overall size in pixels (default: 140) */
  size?: number;
  /** Pen / ink color (default: brand teal #0d9488) */
  color?: string;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Pen SVG — viewBox 0 0 100 100, animated at a writing angle.
//
// The pen is intentionally large within its viewBox so it stays legible at
// the smallest render size (48px → penSize ≈ 30px).
//
// Anatomy: the SVG is drawn upright and rotated by the parent Animated.View.
//
//   Barrel:  slim rounded-rect, pencil-like rather than marker-like
//   Grip:    narrower band below barrel
//   Nib:     fine triangle below grip
//   Slit:    thin line down the center of the nib
// ---------------------------------------------------------------------------

// All coordinates are in the 100×100 pen viewBox.
// Barrel: intentionally slim so the idle ornament reads as a pen, not a marker.
const BARREL_X = 40;
const BARREL_Y = 6;
const BARREL_W = 20;
const BARREL_H = 62;
const BARREL_RX = 5;

// Grip: a separate second-color band below the barrel.
const GRIP_X = 35;
const GRIP_Y = 67;
const GRIP_W = 30;
const GRIP_H = 14;
const GRIP_RX = 4;

// Nib: longer metal fountain-pen point, split into two tones.
const NIB_PATH = 'M36 81 L64 81 L50 100 Z';
const NIB_LEFT_PATH = 'M36 81 L50 81 L50 100 Z';
const NIB_RIGHT_PATH = 'M50 81 L64 81 L50 100 Z';
const NIB_SHOULDER_PATH = 'M39 81 L61 81 L58 86 L42 86 Z';

// Slit: center line on nib
const SLIT_X1 = 50;
const SLIT_Y1 = 79;
const SLIT_X2 = 50;
const SLIT_Y2 = 98;

// ---------------------------------------------------------------------------
// Writing path — cursive wave in viewBox 0 0 100 100.
// Kept readable (not micro-detailed). A gentle S-wave that looks like
// natural handwriting motion.
// ---------------------------------------------------------------------------
const WRITING_PATH = 'M 6 74 C 18 42, 36 88, 52 58 S 78 34, 94 54';
const PATH_LENGTH = 140; // safe overestimate

// ---------------------------------------------------------------------------
// Pen follower: start and end coords of the writing path (in writing viewBox)
// The nib tip should track from start to end.
// ---------------------------------------------------------------------------
const PEN_START = { x: 6, y: 74 };
const PEN_END = { x: 94, y: 54 };

// The pen angle changes slightly during the stroke so the idle ornament has
// visible motion even when the drawing path is short.

// ---------------------------------------------------------------------------
// Ink droplet "glow" accent color (warm amber — per spec)
// ---------------------------------------------------------------------------
const INK_GLOW_COLOR = '#fbbf24';

// ---------------------------------------------------------------------------
// Timing constants — total cycle ≈ 3 000 ms
// ---------------------------------------------------------------------------
const DROP_IN_MS = 300; // pen drops in from above
const SWAY_MS = 200; // brief settle/sway pause
const TRACE_MS = 1800; // pen traces the path
const FLICK_MS = 200; // upward flick at end
const FLOAT_BACK_MS = 400; // pen floats back to start
const FADE_MS = 300; // stroke fades out
const TOTAL_MS = DROP_IN_MS + SWAY_MS + TRACE_MS + FLICK_MS + FLOAT_BACK_MS;
// sanity-check: ~2900ms ≈ 3s

// ---------------------------------------------------------------------------
// Easing helpers — defined as lazy getter functions so they are only
// evaluated at animation time (inside useEffect), not at module load.
// This avoids failures in test environments where the Easing mock may not
// include all methods (elastic, cubic, etc.).
// ---------------------------------------------------------------------------
const getEaseBounce = () => Easing.out(Easing.elastic(1.4));
const getEaseTrace = () => Easing.inOut(Easing.cubic);
const getEaseOut = () => Easing.out(Easing.cubic);
const getEaseIn = () => Easing.in(Easing.quad);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
/**
 * MagicPenAnimation — a charming cartoon fountain pen that writes a cursive
 * loop, with visible ink emerging from the nib and an ink droplet effect.
 *
 * Fabric-safe: all animation is via Animated.View + useAnimatedStyle or
 * AnimatedPath + useAnimatedProps (strokeDashoffset). No SVG-native animated
 * x/y props, no AnimatedCircle with r starting at 0.
 *
 * Renders clearly at 48px (idle state) and 100px+ (topic loading).
 */
export function MagicPenAnimation({
  size = 140,
  color = '#0d9488',
  testID,
}: MagicPenAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  // Only respect the user's motion setting here. If AnimatedPath is not
  // available on a target, the ink stroke may be static, but the pen body still
  // moves because it is animated as an Animated.View.
  const animationDisabled = reduceMotion;
  const penMotion = useRef(
    new RNAnimated.Value(animationDisabled ? 0.55 : 0)
  ).current;

  // -------------------------------------------------------------------------
  // Pen sizing
  // The pen occupies 60% of the canvas along its major axis. Since the pen
  // SVG viewBox is 100×100 and the pen is drawn upright, then rotated,
  // we make the pen container 60% of size. The barrel itself fills ~60% of
  // the viewBox width, so it's clearly visible even at 48px (penContainerSize
  // ≈ 29px → barrel ≈ 17px wide × 35px tall before rotation).
  // -------------------------------------------------------------------------
  const penContainerSize = size * 0.6;
  // scale factor: penViewBox (100) → pixel size
  const penScale = penContainerSize / 100;

  // -------------------------------------------------------------------------
  // Writing viewBox scale — maps writing path coords to pixel canvas coords
  // -------------------------------------------------------------------------
  const drawingScale = size / 100;

  // -------------------------------------------------------------------------
  // Shared values
  // -------------------------------------------------------------------------
  // progress: 0 = start of trace, 1 = end of trace
  const progress = useSharedValue(animationDisabled ? 1 : 0);
  // dropIn: 0 = above canvas, 1 = settled at writing position
  const dropIn = useSharedValue(animationDisabled ? 1 : 0);
  // flick: 0 = normal, 1 = flicked up, 0 = back
  const flick = useSharedValue(0);
  // strokeFade: 1 = visible, 0 = faded out
  const strokeFade = useSharedValue(animationDisabled ? 1 : 0);
  // droplet: 0→1 swells, then fades
  const dropletScale = useSharedValue(0);
  const dropletOpacity = useSharedValue(0);
  // sparkle: 0→1
  const sparkle = useSharedValue(0);

  useEffect(() => {
    if (animationDisabled) {
      penMotion.stopAnimation();
      penMotion.setValue(0.55);
      return;
    }

    penMotion.setValue(0);
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(DROP_IN_MS),
        RNAnimated.timing(penMotion, {
          toValue: 1,
          duration: TRACE_MS,
          easing: RNEasing.inOut(RNEasing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.timing(penMotion, {
          toValue: 1.08,
          duration: FLICK_MS,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.timing(penMotion, {
          toValue: 0,
          duration: FLOAT_BACK_MS,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.delay(180),
      ])
    );

    loop.start();
    return () => {
      loop.stop();
      penMotion.stopAnimation();
    };
  }, [animationDisabled, penMotion]);

  // -------------------------------------------------------------------------
  // Animation loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (animationDisabled) {
      progress.value = 1;
      dropIn.value = 1;
      strokeFade.value = 1;
      return;
    }

    // Reset all to start
    progress.value = 0;
    dropIn.value = 0;
    flick.value = 0;
    strokeFade.value = 0;
    dropletScale.value = 0;
    dropletOpacity.value = 0;
    sparkle.value = 0;

    // Resolve easing functions here (inside useEffect) so they are only
    // evaluated at animation time, not at module load. This prevents failures
    // in test environments where the Easing mock is minimal.
    const easeBounce = getEaseBounce();
    const easeTrace = getEaseTrace();
    const easeOut = getEaseOut();
    const easeIn = getEaseIn();

    // --- Pen drop-in (bouncy settle) ---
    dropIn.value = withRepeat(
      withSequence(
        withTiming(1, { duration: DROP_IN_MS, easing: easeBounce }),
        // hold through trace + flick
        withDelay(
          SWAY_MS + TRACE_MS + FLICK_MS,
          withTiming(1, { duration: 0 })
        ),
        // float back
        withTiming(0, { duration: FLOAT_BACK_MS, easing: easeOut }),
        // brief gap before next cycle
        withTiming(0, { duration: 100 })
      ),
      -1,
      false
    );

    // --- Stroke progress (drives both AnimatedPath and pen X/Y) ---
    progress.value = withRepeat(
      withSequence(
        // wait for drop-in + sway
        withDelay(
          DROP_IN_MS + SWAY_MS,
          withTiming(1, { duration: TRACE_MS, easing: easeTrace })
        ),
        // hold through flick
        withTiming(1, { duration: FLICK_MS }),
        // reset for next cycle
        withTiming(0, { duration: FLOAT_BACK_MS + 100 })
      ),
      -1,
      false
    );

    // --- Stroke visibility (fade out at end of cycle) ---
    strokeFade.value = withRepeat(
      withSequence(
        // appears as trace begins
        withDelay(DROP_IN_MS + SWAY_MS, withTiming(1, { duration: 200 })),
        // stay visible through trace + flick
        withDelay(
          TRACE_MS - 200 + FLICK_MS,
          // fade out during float-back
          withTiming(0, { duration: FADE_MS, easing: easeOut })
        ),
        // gap
        withTiming(0, { duration: 100 })
      ),
      -1,
      false
    );

    // --- Pen flick at end ---
    flick.value = withRepeat(
      withSequence(
        // wait for drop-in + sway + trace
        withDelay(
          DROP_IN_MS + SWAY_MS + TRACE_MS,
          withTiming(1, { duration: FLICK_MS / 2, easing: easeOut })
        ),
        withTiming(0, { duration: FLICK_MS / 2, easing: easeOut }),
        // hold through float-back + gap
        withTiming(0, { duration: FLOAT_BACK_MS + 100 })
      ),
      -1,
      false
    );

    // --- Ink droplet at nib (swells then dissolves, once per cycle at ~60% trace) ---
    // Uses Animated.View scale (Fabric-safe — NOT AnimatedCircle with r=0)
    const dropletDelay = DROP_IN_MS + SWAY_MS + Math.round(TRACE_MS * 0.6);
    dropletScale.value = withRepeat(
      withSequence(
        withDelay(
          dropletDelay,
          withTiming(1, { duration: 120, easing: easeOut })
        ),
        withTiming(1.4, { duration: 80 }),
        withTiming(0, { duration: 200, easing: easeIn }),
        withTiming(0, { duration: TOTAL_MS - dropletDelay - 400 })
      ),
      -1,
      false
    );
    dropletOpacity.value = withRepeat(
      withSequence(
        withDelay(dropletDelay, withTiming(0.9, { duration: 120 })),
        withTiming(0, { duration: 280 }),
        withTiming(0, { duration: TOTAL_MS - dropletDelay - 400 })
      ),
      -1,
      false
    );

    // --- Sparkle (one cross puff at ~80% trace) ---
    const sparkleDelay = DROP_IN_MS + SWAY_MS + Math.round(TRACE_MS * 0.8);
    sparkle.value = withRepeat(
      withSequence(
        withDelay(
          sparkleDelay,
          withTiming(1, { duration: 150, easing: easeOut })
        ),
        withTiming(0, { duration: 200, easing: easeIn }),
        withTiming(0, { duration: TOTAL_MS - sparkleDelay - 350 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(progress);
      cancelAnimation(dropIn);
      cancelAnimation(flick);
      cancelAnimation(strokeFade);
      cancelAnimation(dropletScale);
      cancelAnimation(dropletOpacity);
      cancelAnimation(sparkle);
    };
  }, [
    animationDisabled,
    progress,
    dropIn,
    flick,
    strokeFade,
    dropletScale,
    dropletOpacity,
    sparkle,
  ]);

  // -------------------------------------------------------------------------
  // Animated props — ink stroke (strokeDashoffset, Fabric-safe)
  // -------------------------------------------------------------------------
  const pathAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - progress.value),
  }));

  // -------------------------------------------------------------------------
  // Animated styles
  // -------------------------------------------------------------------------

  // Ink stroke opacity
  const strokeStyle = useAnimatedStyle(() => ({
    opacity: strokeFade.value,
  }));

  // Droplet at nib tip (Animated.View scale — Fabric-safe, no AnimatedCircle r=0)
  const dropletStyle = useAnimatedStyle(() => {
    // Position droplet at the current nib position
    const drawX = PEN_START.x + (PEN_END.x - PEN_START.x) * progress.value;
    const drawY = PEN_START.y + (PEN_END.y - PEN_START.y) * progress.value;
    const nibPixelX = drawX * drawingScale;
    const nibPixelY = drawY * drawingScale;

    return {
      opacity: dropletOpacity.value,
      transform: [
        { translateX: nibPixelX - 4 },
        { translateY: nibPixelY - 2 },
        { scale: dropletScale.value },
      ],
    };
  });

  // Sparkle at a fixed crossing point (~mid-path)
  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkle.value,
    transform: [{ scale: 0.4 + sparkle.value * 0.6 }],
  }));

  // Leading edge dot (ink emerging from nib — small bright dot at nib position)
  const nibDotStyle = useAnimatedStyle(() => {
    const drawX = PEN_START.x + (PEN_END.x - PEN_START.x) * progress.value;
    const drawY = PEN_START.y + (PEN_END.y - PEN_START.y) * progress.value;
    const nibPixelX = drawX * drawingScale;
    const nibPixelY = drawY * drawingScale;

    return {
      opacity: strokeFade.value * 0.85,
      transform: [{ translateX: nibPixelX - 3 }, { translateY: nibPixelY - 3 }],
    };
  });

  // -------------------------------------------------------------------------
  // Derived colors
  // -------------------------------------------------------------------------
  // Grip is slightly darker (use opacity trick — dark overlay)
  // Sparkle position (fixed crossing point on the writing path, approx 50% t)
  const sparkleX =
    (PEN_START.x + (PEN_END.x - PEN_START.x) * 0.5) * drawingScale;
  const sparkleY =
    (PEN_START.y + (PEN_END.y - PEN_START.y) * 0.5) * drawingScale;
  const sparkleSize = Math.max(6, size * 0.08);

  // Droplet base size
  const dropletRadius = Math.max(3, size * 0.055);
  const bodyColor = color;
  const trimColor = INK_GLOW_COLOR;
  const nibColor = '#f8fafc';
  const nibShadowColor = '#dbeafe';
  const outlineColor = '#111827';
  const capColor = '#0f766e';
  const clipColor = '#ccfbf1';
  // The visible pen travel uses React Native core Animated. Reanimated SVG
  // props can be static in Expo web previews, while core transform animation is
  // reliable there and still works on native.
  const nibOffsetX = penContainerSize * 0.35;
  const nibOffsetY = penContainerSize * 0.85;
  const penStartX = PEN_START.x * drawingScale - nibOffsetX;
  const penEndX = PEN_END.x * drawingScale - nibOffsetX;
  const penStartY = PEN_START.y * drawingScale - nibOffsetY;
  const penEndY = PEN_END.y * drawingScale - nibOffsetY;
  const penMidY = ((PEN_START.y + PEN_END.y) / 2) * drawingScale - nibOffsetY;
  const penBodyMotionStyle = {
    transform: [
      {
        translateX: penMotion.interpolate({
          inputRange: [0, 1, 1.08],
          outputRange: [penStartX, penEndX, penEndX + size * 0.04],
          extrapolate: 'clamp',
        }),
      },
      {
        translateY: penMotion.interpolate({
          inputRange: [0, 0.18, 0.5, 0.82, 1, 1.08],
          outputRange: [
            penStartY - size * 0.38,
            penStartY + size * 0.03,
            penMidY - size * 0.04,
            penEndY + size * 0.04,
            penEndY,
            penEndY - size * 0.09,
          ],
          extrapolate: 'clamp',
        }),
      },
      {
        rotate: penMotion.interpolate({
          inputRange: [0, 0.5, 1, 1.08],
          outputRange: ['32deg', '39deg', '45deg', '26deg'],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  // -------------------------------------------------------------------------
  // Reduced motion: static render (pen mid-stroke, full line visible)
  // -------------------------------------------------------------------------
  if (animationDisabled) {
    // Static mid-stroke position
    const staticProgress = 0.55;
    const staticDrawX =
      PEN_START.x + (PEN_END.x - PEN_START.x) * staticProgress;
    const staticDrawY =
      PEN_START.y + (PEN_END.y - PEN_START.y) * staticProgress;
    const staticNibX = staticDrawX * drawingScale;
    const staticNibY = staticDrawY * drawingScale;

    return (
      <View
        testID={testID}
        accessibilityLabel="Writing animation"
        accessibilityRole="image"
        style={{ width: size, height: size, position: 'relative' }}
      >
        {/* Static ink stroke — full path visible */}
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Path
            d={WRITING_PATH}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>

        {/* Static pen body */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: penContainerSize,
            height: penContainerSize,
            transform: [
              { translateX: staticNibX - nibOffsetX },
              { translateY: staticNibY - nibOffsetY },
              { rotate: `${34 + staticProgress * 10}deg` },
            ],
            pointerEvents: 'none',
          }}
        >
          <Svg
            width={penContainerSize}
            height={penContainerSize}
            viewBox="0 0 100 100"
          >
            {/* Barrel */}
            <Polygon
              points="40,6 60,6 64,14 36,14"
              fill={capColor}
              opacity={0.95}
            />
            <Rect
              x={BARREL_X}
              y={BARREL_Y}
              width={BARREL_W}
              height={BARREL_H}
              rx={BARREL_RX}
              fill={bodyColor}
              stroke={outlineColor}
              strokeWidth={1.5 / penScale}
              strokeOpacity={0.2}
            />
            <Rect
              x={BARREL_X + 2}
              y={BARREL_Y}
              width={BARREL_W - 4}
              height={10}
              rx={3.5}
              fill={trimColor}
              opacity={0.95}
            />
            <Path
              d="M57 17 C64 29, 62 43, 56 53"
              stroke={clipColor}
              strokeWidth={3 / penScale}
              strokeOpacity={0.82}
              fill="none"
              strokeLinecap="round"
            />
            {/* Grip */}
            <Rect
              x={GRIP_X}
              y={GRIP_Y}
              width={GRIP_W}
              height={GRIP_H}
              rx={GRIP_RX}
              fill={trimColor}
              stroke={outlineColor}
              strokeWidth={1.5 / penScale}
              strokeOpacity={0.2}
            />
            {/* Split nib: pale metal plus blue shadow for depth. */}
            <Path
              d={NIB_SHOULDER_PATH}
              fill={trimColor}
              opacity={0.95}
              strokeLinejoin="round"
            />
            <Path d={NIB_LEFT_PATH} fill={nibColor} strokeLinejoin="round" />
            <Path
              d={NIB_RIGHT_PATH}
              fill={nibShadowColor}
              strokeLinejoin="round"
            />
            <Path
              d={NIB_PATH}
              fill="none"
              stroke={outlineColor}
              strokeWidth={1 / penScale}
              strokeOpacity={0.25}
              strokeLinejoin="round"
            />
            {/* Nib center slit */}
            <Line
              x1={SLIT_X1}
              y1={SLIT_Y1}
              x2={SLIT_X2}
              y2={SLIT_Y2}
              stroke={outlineColor}
              strokeOpacity={0.3}
              strokeWidth={1 / penScale}
              strokeLinecap="round"
            />
            <Circle cx={50} cy={97} r={1.5} fill={bodyColor} opacity={0.7} />
          </Svg>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Animated render
  // -------------------------------------------------------------------------
  return (
    <View
      testID={testID}
      accessibilityLabel="Writing animation"
      accessibilityRole="image"
      style={{ width: size, height: size, position: 'relative' }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Ink stroke (AnimatedPath + strokeDashoffset — Fabric-safe)          */}
      {/* Wrapped in Animated.View for opacity (strokeFade)                   */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, width: size, height: size },
          strokeStyle,
          { pointerEvents: 'none' },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {/* Thicker ghost stroke for ink "body" behind leading edge */}
          <AnimatedPath
            d={WRITING_PATH}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={PATH_LENGTH}
            animatedProps={pathAnimatedProps}
            opacity={0.25}
          />
          {/* Main crisp stroke */}
          <AnimatedPath
            d={WRITING_PATH}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={PATH_LENGTH}
            animatedProps={pathAnimatedProps}
          />
        </Svg>
      </Animated.View>

      {/* ------------------------------------------------------------------ */}
      {/* Leading-edge nib dot — small bright dot at ink tip (Animated.View) */}
      {/* Makes ink look like it's emerging from the pen, not appearing        */}
      {/* magically. Fabric-safe (View scale, not SVG r).                     */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          },
          nibDotStyle,
          { pointerEvents: 'none' },
        ]}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Ink droplet: swells at nib then dissolves (Animated.View scale)     */}
      {/* Fabric-safe: scale animated, NOT AnimatedCircle r starting at 0     */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: dropletRadius * 2,
            height: dropletRadius * 2,
            borderRadius: dropletRadius,
            backgroundColor: INK_GLOW_COLOR,
          },
          dropletStyle,
          { pointerEvents: 'none' },
        ]}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Sparkle — 4-point cross puff at one path crossing point (once/cycle) */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: sparkleX - sparkleSize / 2,
            top: sparkleY - sparkleSize / 2,
            width: sparkleSize,
            height: sparkleSize,
          },
          sparkleStyle,
          { pointerEvents: 'none' },
        ]}
      >
        <Svg width={sparkleSize} height={sparkleSize} viewBox="0 0 10 10">
          {/* Horizontal arm */}
          <Line
            x1={0}
            y1={5}
            x2={10}
            y2={5}
            stroke={INK_GLOW_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Vertical arm */}
          <Line
            x1={5}
            y1={0}
            x2={5}
            y2={10}
            stroke={INK_GLOW_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Diagonal arms (smaller) */}
          <Line
            x1={1.5}
            y1={1.5}
            x2={8.5}
            y2={8.5}
            stroke={INK_GLOW_COLOR}
            strokeWidth={0.8}
            strokeLinecap="round"
          />
          <Line
            x1={8.5}
            y1={1.5}
            x2={1.5}
            y2={8.5}
            stroke={INK_GLOW_COLOR}
            strokeWidth={0.8}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* ------------------------------------------------------------------ */}
      {/* Pen body — Animated.View with static SVG inside (Fabric-safe)       */}
      {/* The SVG uses a 100×100 viewBox with a large, clearly readable pen.  */}
      {/* Rotated by the animated style so it points upper-left to lower-right. */}
      {/* ------------------------------------------------------------------ */}
      <RNAnimated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: penContainerSize,
            height: penContainerSize,
          },
          penBodyMotionStyle,
          { pointerEvents: 'none' },
        ]}
      >
        <Svg
          width={penContainerSize}
          height={penContainerSize}
          viewBox="0 0 100 100"
        >
          {/* ----- Barrel ----- */}
          <Polygon
            points="40,6 60,6 64,14 36,14"
            fill={capColor}
            opacity={0.95}
          />
          <Rect
            x={BARREL_X}
            y={BARREL_Y}
            width={BARREL_W}
            height={BARREL_H}
            rx={BARREL_RX}
            fill={bodyColor}
            stroke={outlineColor}
            strokeWidth={1.5 / penScale}
            strokeOpacity={0.2}
          />
          {/* Clip-like cap band: the second color keeps the pen from becoming a blob. */}
          <Rect
            x={BARREL_X + 2}
            y={BARREL_Y}
            width={BARREL_W - 4}
            height={10}
            rx={3.5}
            fill={trimColor}
            opacity={0.95}
          />
          <Path
            d="M57 17 C64 29, 62 43, 56 53"
            stroke={clipColor}
            strokeWidth={3 / penScale}
            strokeOpacity={0.82}
            fill="none"
            strokeLinecap="round"
          />
          {/* Barrel highlight stripe (white shimmer) */}
          <Rect
            x={BARREL_X + 5}
            y={BARREL_Y + 17}
            width={4}
            height={BARREL_H - 24}
            rx={2}
            fill="#ffffff"
            opacity={0.22}
          />

          {/* ----- Grip ----- */}
          <Rect
            x={GRIP_X}
            y={GRIP_Y}
            width={GRIP_W}
            height={GRIP_H}
            rx={GRIP_RX}
            fill={trimColor}
            stroke={outlineColor}
            strokeWidth={1.5 / penScale}
            strokeOpacity={0.2}
          />
          <Line
            x1={GRIP_X + 6}
            y1={GRIP_Y + 3}
            x2={GRIP_X + 6}
            y2={GRIP_Y + GRIP_H - 3}
            stroke={outlineColor}
            strokeOpacity={0.18}
            strokeWidth={1 / penScale}
          />
          <Line
            x1={GRIP_X + 17}
            y1={GRIP_Y + 3}
            x2={GRIP_X + 17}
            y2={GRIP_Y + GRIP_H - 3}
            stroke={outlineColor}
            strokeOpacity={0.18}
            strokeWidth={1 / penScale}
          />
          <Line
            x1={GRIP_X + 28}
            y1={GRIP_Y + 3}
            x2={GRIP_X + 28}
            y2={GRIP_Y + GRIP_H - 3}
            stroke={outlineColor}
            strokeOpacity={0.18}
            strokeWidth={1 / penScale}
          />

          {/* ----- Nib (triangle) ----- */}
          <Path
            d={NIB_SHOULDER_PATH}
            fill={trimColor}
            opacity={0.95}
            strokeLinejoin="round"
          />
          <Path d={NIB_LEFT_PATH} fill={nibColor} strokeLinejoin="round" />
          <Path
            d={NIB_RIGHT_PATH}
            fill={nibShadowColor}
            strokeLinejoin="round"
          />
          <Path
            d={NIB_PATH}
            fill="none"
            stroke={outlineColor}
            strokeWidth={1 / penScale}
            strokeOpacity={0.25}
            strokeLinejoin="round"
          />
          {/* Nib center slit */}
          <Line
            x1={SLIT_X1}
            y1={SLIT_Y1}
            x2={SLIT_X2}
            y2={SLIT_Y2}
            stroke={outlineColor}
            strokeOpacity={0.3}
            strokeWidth={1.2 / penScale}
            strokeLinecap="round"
          />

          {/* Nib tip gleam — small white dot (static, no AnimatedCircle) */}
          <Circle cx={50} cy={97} r={1.5} fill={bodyColor} opacity={0.7} />
        </Svg>
      </RNAnimated.View>
    </View>
  );
}
