import { useEffect } from 'react';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
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
// Pen SVG — viewBox 0 0 100 100, angled at 45°
//
// The pen is intentionally large within its viewBox so it stays legible at
// the smallest render size (48px → penSize ≈ 30px).
//
// Anatomy (drawn pointing upper-left → lower-right at 45°, but the SVG is
// drawn upright and rotated by the parent Animated.View):
//
//   Barrel:  slim rounded-rect, pencil-like rather than marker-like
//   Grip:    narrower band below barrel
//   Nib:     fine triangle below grip
//   Slit:    thin line down the center of the nib
// ---------------------------------------------------------------------------

// All coordinates are in the 100×100 pen viewBox.
// Barrel: slim, readable pencil body.
const BARREL_X = 36;
const BARREL_Y = 5;
const BARREL_W = 28;
const BARREL_H = 60;
const BARREL_RX = 6;

// Grip: slightly narrower, sits directly below barrel
const GRIP_X = 33;
const GRIP_Y = 65;
const GRIP_W = 34;
const GRIP_H = 13;
const GRIP_RX = 4;

// Nib: triangle from bottom of grip to a point
const NIB_PATH = 'M34 78 L66 78 L50 100 Z';
const NIB_LEFT_PATH = 'M34 78 L50 78 L50 100 Z';
const NIB_RIGHT_PATH = 'M50 78 L66 78 L50 100 Z';

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
const WRITING_PATH = 'M 8 70 C 20 40, 38 90, 52 55 S 78 38, 92 62';
const PATH_LENGTH = 140; // safe overestimate

// ---------------------------------------------------------------------------
// Pen follower: start and end coords of the writing path (in writing viewBox)
// The nib tip should track from start to end.
// ---------------------------------------------------------------------------
const PEN_START = { x: 8, y: 70 };
const PEN_END = { x: 92, y: 62 };

// Approximate slope of path at start (for initial pen angle)
// We use a fixed 45° angle throughout for simplicity, matching the pen body
// orientation.

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

  // -------------------------------------------------------------------------
  // Pen sizing
  // The pen occupies 60% of the canvas along its major axis. Since the pen
  // SVG viewBox is 100×100 and the pen is drawn upright (then rotated 45°),
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

  // Pen body: drops in from above, tracks writing progress, flicks at end
  const penBodyStyle = useAnimatedStyle(() => {
    // Current nib position in drawing coords (0–100)
    const drawX = PEN_START.x + (PEN_END.x - PEN_START.x) * progress.value;
    const drawY = PEN_START.y + (PEN_END.y - PEN_START.y) * progress.value;

    // Pixel position of nib tip in canvas space
    const nibPixelX = drawX * drawingScale;
    const nibPixelY = drawY * drawingScale;

    // The pen container is rotated 45°. The nib tip is at the bottom of the
    // pen SVG viewBox (y=100 in pen coords), so after rotation the nib tip
    // is at the container's lower-right corner. We offset the container so
    // the nib tip lands at the nib pixel position.
    //
    // For a 45° rotated square container of side L:
    //   After rotation, top-left corner shifts by (-L/2, -L/2) from centre.
    //   Nib is at bottom-centre of SVG = (L/2, L) in unrotated coords.
    //   After 45° rotation, nib tip relative to centre ≈ (L/√2 * sin45, L/√2 * cos0)
    //   ≈ (0, L * 0.7)  — approximately.
    // We use a simpler empirical offset: nib tip ≈ 0.35 * container from left,
    // 0.85 * container from top (tweaked for the pen shape).
    const nibOffsetX = penContainerSize * 0.35;
    const nibOffsetY = penContainerSize * 0.85;

    // Drop-in: pen arrives from above (starts -size/2 above canvas)
    const dropOffset = (1 - dropIn.value) * -(size * 0.5);

    // Flick: slight upward rotate + translateY
    const flickAngle = flick.value * -10; // degrees
    const flickY = flick.value * -6; // pixels

    return {
      transform: [
        { translateX: nibPixelX - nibOffsetX },
        { translateY: nibPixelY - nibOffsetY + dropOffset + flickY },
        { rotate: `${45 + flickAngle}deg` },
      ],
    };
  });

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
    const nibOffsetX = penContainerSize * 0.35;
    const nibOffsetY = penContainerSize * 0.85;

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
              { rotate: '45deg' },
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
              points="40,5 60,5 66,13 34,13"
              fill={trimColor}
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
              x={BARREL_X + 3}
              y={BARREL_Y}
              width={BARREL_W - 6}
              height={9}
              rx={4}
              fill={trimColor}
              opacity={0.95}
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
      {/* Rotated 45° so it points upper-left to lower-right.                 */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: penContainerSize,
            height: penContainerSize,
          },
          penBodyStyle,
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
            points="40,5 60,5 66,13 34,13"
            fill={trimColor}
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
            x={BARREL_X + 3}
            y={BARREL_Y}
            width={BARREL_W - 6}
            height={9}
            rx={4}
            fill={trimColor}
            opacity={0.95}
          />
          {/* Barrel highlight stripe (white shimmer) */}
          <Rect
            x={BARREL_X + 8}
            y={BARREL_Y + 14}
            width={6}
            height={BARREL_H - 20}
            rx={3}
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
      </Animated.View>
    </View>
  );
}
