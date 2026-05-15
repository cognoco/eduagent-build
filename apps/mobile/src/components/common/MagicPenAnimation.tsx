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
  interpolate,
  Extrapolation,
  Easing,
  type AnimatedProps,
} from 'react-native-reanimated';
import Svg, { Path, Rect, Line, Circle, Ellipse } from 'react-native-svg';

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
    Path,
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
// Pen SVG — viewBox 0 0 100 100, drawn horizontally then rotated.
//
// The SVG draws a slim capsule pen oriented left-to-right with the writing
// tip on the right; the parent Animated.View rotates it ~32–45° clockwise
// so it appears tilted with the cap at upper-left and nib at lower-right.
//
// Anatomy (left → right along the horizontal axis):
//
//   Cap:      dark rounded capsule (the back of the pen)
//   Ferrule:  thin teal band linking cap to barrel
//   Barrel:   translucent mint glass with an inner highlight strip
//   Section:  solid teal collar between barrel and nib
//   Nib:      short cone tapering to the writing tip
//   Tip:      yellow ink-bead glow at the writing point
// ---------------------------------------------------------------------------

// All coordinates are in the 100×100 pen viewBox.
// Pen lies horizontally with the writing tip on the right; rotated by the
// parent Animated.View so it appears tilted with the cap upper-left and
// nib lower-right.
//
// Layout along the horizontal axis:
//   x=14–22   cap finial (rounded dark end)
//   x=22–24   thread ring (dark band at cap base)
//   x=24–70   translucent tinted barrel with inner ink cartridge
//   x=70–72   black ring above the steel grip
//   x=72–75   polished steel grip ring (with white shine on top edge)
//   x=75–78   black grip trapezoid (narrows toward the nib)
//   x=78–87.5 silver steel nib triangle (with slit and breather hole)
//   x=88      writing-tip ink bead

// Cap finial: rounded LEFT end, square at the barrel side.
const FINIAL_PATH = 'M 22 44 L 22 56 L 19 56 Q 14 56, 14 50 Q 14 44, 19 44 Z';

// Black grip trapezoid: wider on the steel side, narrower at the nib base.
const GRIP_PATH = 'M 75 44 L 75 56 L 78 53 L 78 47 Z';

// Silver steel nib: triangle from grip base to a near-point at the tip.
const NIB_PATH = 'M 78 47 L 78 53 L 87.5 50.5 L 87.5 49.5 Z';

// Nib upper-half white shading.
const NIB_SHADING_PATH = 'M 78 47 L 78 50 L 87.5 50 L 87.5 49.5 Z';

// Writing-tip ink bead position (and pen reference point).
const TIP_CX = 88;
const TIP_CY = 50;

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
// Timing constants — total cycle ≈ 5 800 ms (slow handwriting pace)
// ---------------------------------------------------------------------------
const DROP_IN_MS = 400; // pen drops in from above
const SWAY_MS = 200; // brief settle/sway pause
const TRACE_MS = 4500; // pen traces the path
const FLICK_MS = 200; // upward flick at end
const FLOAT_BACK_MS = 500; // pen floats back to start
const FADE_MS = 350; // stroke fades out
const GAP_MS = 200; // pause before next loop
// Single canonical cycle length. Every withRepeat sequence below MUST sum to
// CYCLE_MS so the values stay in lockstep — otherwise individual animations
// drift cycle-by-cycle and ink/pen/flick fall out of sync.
const CYCLE_MS =
  DROP_IN_MS + SWAY_MS + TRACE_MS + FLICK_MS + FLOAT_BACK_MS + GAP_MS;
// Backwards-compatible alias used by droplet/sparkle math below.
const TOTAL_MS = CYCLE_MS;

// Falling ink droplet: triggers at ~40% of trace, falls and fades over 1.5s.
const DROP_TRIGGER_PROGRESS = 0.4;
const DROP_FALL_MS = 1500;

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
  // droplet: 0→1 appears, then fades; dropletFall: 0→1 falls under gravity
  const dropletScale = useSharedValue(0);
  const dropletOpacity = useSharedValue(0);
  const dropletFall = useSharedValue(0);
  // penOpacity: fades in during drop-in, holds, fades out during float-back
  const penOpacity = useSharedValue(animationDisabled ? 1 : 0);
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
    dropletFall.value = 0;
    penOpacity.value = 0;
    sparkle.value = 0;

    // Resolve easing functions here (inside useEffect) so they are only
    // evaluated at animation time, not at module load. This prevents failures
    // in test environments where the Easing mock is minimal.
    const easeBounce = getEaseBounce();
    const easeTrace = getEaseTrace();
    const easeOut = getEaseOut();
    const easeIn = getEaseIn();

    // --- Pen drop-in (bouncy settle) ---
    // 400 + 4900 + 500 + 200 = 6000
    dropIn.value = withRepeat(
      withSequence(
        withTiming(1, { duration: DROP_IN_MS, easing: easeBounce }),
        // hold through sway + trace + flick
        withDelay(
          SWAY_MS + TRACE_MS + FLICK_MS,
          withTiming(1, { duration: 0 }),
        ),
        // float back
        withTiming(0, { duration: FLOAT_BACK_MS, easing: easeOut }),
        // gap before next cycle (matches GAP_MS so cycle = CYCLE_MS)
        withTiming(0, { duration: GAP_MS }),
      ),
      -1,
      false,
    );

    // --- Stroke progress (drives both ink stroke AND pen X/Y) ---
    // 5100 + 900 + 0 = 6000
    // Hold at 1 through flick + float-back + gap, then snap back instantly so
    // the pen — which is positioned from progress — doesn't visibly rewind
    // along the path during the reset. penOpacity hides the pen during the
    // back-half of the hold so the snap is invisible.
    progress.value = withRepeat(
      withSequence(
        withDelay(
          DROP_IN_MS + SWAY_MS,
          withTiming(1, { duration: TRACE_MS, easing: easeTrace }),
        ),
        withTiming(1, { duration: FLICK_MS + FLOAT_BACK_MS + GAP_MS }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );

    // --- Stroke visibility (fade out at end of cycle) ---
    // 800 + 4850 + 350 = 6000
    strokeFade.value = withRepeat(
      withSequence(
        // appears as trace begins
        withDelay(DROP_IN_MS + SWAY_MS, withTiming(1, { duration: 200 })),
        // stay visible through trace + flick, then fade during float-back
        withDelay(
          TRACE_MS - 200 + FLICK_MS,
          withTiming(0, { duration: FADE_MS, easing: easeOut }),
        ),
        // remaining gap to fill the cycle
        withTiming(0, { duration: CYCLE_MS - 800 - 4850 }),
      ),
      -1,
      false,
    );

    // --- Pen flick at end ---
    // 5400 + 100 + 500 = 6000
    flick.value = withRepeat(
      withSequence(
        // wait for drop-in + sway + trace, then peak
        withDelay(
          DROP_IN_MS + SWAY_MS + TRACE_MS,
          withTiming(1, { duration: FLICK_MS / 2, easing: easeOut }),
        ),
        withTiming(0, { duration: FLICK_MS / 2, easing: easeOut }),
        // hold through float-back + gap
        withTiming(0, { duration: FLOAT_BACK_MS }),
      ),
      -1,
      false,
    );

    // --- Falling ink droplet — appears at the nib at ~40% trace, falls under
    // gravity (easeIn) and fades out over ~1.5s. Fabric-safe (Animated.View
    // scale + translateY, not AnimatedCircle r=0). ---
    const dropletDelay =
      DROP_IN_MS + SWAY_MS + Math.round(TRACE_MS * DROP_TRIGGER_PROGRESS);
    const dropletTrailing = TOTAL_MS - dropletDelay - DROP_FALL_MS;
    // scale: pop to 1 quickly at trigger, hold during fall, then disappear
    dropletScale.value = withRepeat(
      withSequence(
        withDelay(
          dropletDelay,
          withTiming(1, { duration: 80, easing: easeOut }),
        ),
        withTiming(1, { duration: DROP_FALL_MS - 80 }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: dropletTrailing }),
      ),
      -1,
      false,
    );
    // opacity: fade in fast, fade out gently as it falls
    dropletOpacity.value = withRepeat(
      withSequence(
        withDelay(dropletDelay, withTiming(0.85, { duration: 80 })),
        withTiming(0, { duration: DROP_FALL_MS - 80, easing: easeIn }),
        withTiming(0, { duration: dropletTrailing }),
      ),
      -1,
      false,
    );
    // fall: 0 → 1 with easeIn (gravity) over the full fall duration
    dropletFall.value = withRepeat(
      withSequence(
        withDelay(dropletDelay, withTiming(0, { duration: 0 })),
        withTiming(1, { duration: DROP_FALL_MS, easing: easeIn }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: dropletTrailing }),
      ),
      -1,
      false,
    );

    // --- Pen body + tip-glow opacity ---
    // Fades in during drop-in, holds at 1 through trace+flick, fades out
    // during float-back (matches the reference's `fade` envelope so the pen
    // and yellow halo disappear together at the end of each cycle).
    penOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: DROP_IN_MS, easing: easeOut }),
        withTiming(1, { duration: SWAY_MS + TRACE_MS + FLICK_MS }),
        withTiming(0, { duration: FLOAT_BACK_MS, easing: easeIn }),
        withTiming(0, { duration: GAP_MS }),
      ),
      -1,
      false,
    );

    // --- Sparkle (one cross puff at ~80% trace) ---
    const sparkleDelay = DROP_IN_MS + SWAY_MS + Math.round(TRACE_MS * 0.8);
    sparkle.value = withRepeat(
      withSequence(
        withDelay(
          sparkleDelay,
          withTiming(1, { duration: 150, easing: easeOut }),
        ),
        withTiming(0, { duration: 200, easing: easeIn }),
        withTiming(0, { duration: TOTAL_MS - sparkleDelay - 350 }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(progress);
      cancelAnimation(dropIn);
      cancelAnimation(flick);
      cancelAnimation(strokeFade);
      cancelAnimation(dropletScale);
      cancelAnimation(dropletOpacity);
      cancelAnimation(dropletFall);
      cancelAnimation(penOpacity);
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
    dropletFall,
    penOpacity,
    sparkle,
  ]);

  // -------------------------------------------------------------------------
  // Animated props — ink stroke (strokeDashoffset, Fabric-safe)
  // -------------------------------------------------------------------------
  const pathAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - progress.value),
  }));

  // -------------------------------------------------------------------------
  // Derived colors and geometry
  // -------------------------------------------------------------------------
  // These values must be declared before useAnimatedStyle callbacks. Reanimated
  // can evaluate worklets during hook setup on web, and later const bindings
  // are still in the temporal dead zone at that point.
  const sparkleX =
    (PEN_START.x + (PEN_END.x - PEN_START.x) * 0.5) * drawingScale;
  const sparkleY =
    (PEN_START.y + (PEN_END.y - PEN_START.y) * 0.5) * drawingScale;
  const sparkleSize = Math.max(6, size * 0.08);

  const dropletRadius = Math.max(3, size * 0.055);
  const bodyColor = color;
  const capColor = '#1a1a1a';
  const steelColor = '#cfd4dc';
  const steelDeepColor = '#9aa3ad';
  const slitColor = '#5a6470';

  // The visible pen travel uses Reanimated shared values.
  // The pen is drawn horizontally with the writing tip at (88, 50) inside a
  // 100×100 viewBox, then rotated ~32–45° clockwise. The empirical offsets
  // below place the rotated tip onto the writing path with minimal drift
  // across the rotation range.
  const nibOffsetX = penContainerSize * 0.79;
  const nibOffsetY = penContainerSize * 0.74;
  const penStartX = PEN_START.x * drawingScale - nibOffsetX;
  const penEndX = PEN_END.x * drawingScale - nibOffsetX;
  const penStartY = PEN_START.y * drawingScale - nibOffsetY;
  const penEndY = PEN_END.y * drawingScale - nibOffsetY;
  const penMidY = ((PEN_START.y + PEN_END.y) / 2) * drawingScale - nibOffsetY;

  // -------------------------------------------------------------------------
  // Animated styles
  // -------------------------------------------------------------------------

  // Ink stroke opacity
  const strokeStyle = useAnimatedStyle(() => ({
    opacity: strokeFade.value,
  }));

  // Pen body + tip-glow opacity (fades in/out around the trace)
  const penOpacityStyle = useAnimatedStyle(() => ({
    opacity: penOpacity.value,
  }));

  // Falling droplet — anchored at the nib position when triggered (40% trace),
  // then falls under gravity by `dropletFall.value * size * 0.18` pixels and
  // elongates slightly along Y as it stretches.
  const dropletAnchorX =
    (PEN_START.x + (PEN_END.x - PEN_START.x) * DROP_TRIGGER_PROGRESS) *
    drawingScale;
  const dropletAnchorY =
    (PEN_START.y + (PEN_END.y - PEN_START.y) * DROP_TRIGGER_PROGRESS) *
    drawingScale;
  const dropletFallDistance = size * 0.18;
  const dropletStyle = useAnimatedStyle(() => {
    const fallY = dropletFall.value * dropletFallDistance;
    return {
      opacity: dropletOpacity.value,
      transform: [
        { translateX: dropletAnchorX - dropletRadius },
        { translateY: dropletAnchorY + fallY - dropletRadius },
        { scaleX: dropletScale.value },
        { scaleY: dropletScale.value * (1 + dropletFall.value * 0.5) },
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

  // Pen body motion driven entirely from Reanimated shared values so it
  // shares the ink stroke's scheduler — no two-clock drift, and the pen
  // actually animates on Expo web previews where react-native-svg transforms
  // ignore RN core Animated values driven via useNativeDriver.
  //
  //   progress: 0 pre-trace, 0→1 along the path during trace, held at 1
  //             through flick + float-back (snaps to 0 at cycle wrap).
  //   dropIn:   0 above the path, 0→1 during drop-in, 1 across the trace,
  //             1→0 during float-back.
  //   flick:    0→1→0 spike at end of trace; adds the upward flick.
  //
  // Drop-in is applied as a separate Y lift on top of the trace waveform,
  // so the pen lands on the path BEFORE the trace starts (instead of
  // hovering above it for the first ~1.6s of the eased trace).
  const penBodyAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const di = dropIn.value;
    const fl = flick.value;

    const baseX = penStartX + (penEndX - penStartX) * p;
    const flickX = fl * size * 0.04;

    // Y wobble along the cursive path during the trace. Waypoints are the
    // original wobble (minus the drop-in entry) re-keyed to `p` (which is
    // already eased, so input fractions are in eased-time-space matching
    // the original 0.5 / 0.82 keyframes).
    const baseY = interpolate(
      p,
      [0, 0.5, 0.82, 1],
      [
        penStartY + size * 0.03,
        penMidY - size * 0.04,
        penEndY + size * 0.04,
        penEndY,
      ],
      Extrapolation.CLAMP,
    );
    const dropInLift = (1 - di) * size * 0.38;
    const flickY = -fl * size * 0.09;

    // Tangent-following tilt — pen leans into each curve segment.
    // Sampled from the cubic-bezier WRITING_PATH at t = 0, 0.25, 0.5, 0.75, 1.
    const baseRotateDeg = interpolate(
      p,
      [0, 0.25, 0.5, 0.75, 1],
      [17, 46, 20, 39, 53],
      Extrapolation.CLAMP,
    );
    // Flick raises the nib by ~18°.
    const flickRotateDeg = -fl * 18;

    return {
      transform: [
        { translateX: baseX + flickX },
        { translateY: baseY - dropInLift + flickY },
        { rotate: `${baseRotateDeg + flickRotateDeg}deg` },
      ],
    };
  });

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
              { rotate: `${36 + staticProgress * 8}deg` },
            ],
            pointerEvents: 'none',
          }}
        >
          <Svg
            width={penContainerSize}
            height={penContainerSize}
            viewBox="0 0 100 100"
          >
            {/* Cap finial — rounded dark end */}
            <Path d={FINIAL_PATH} fill={capColor} />
            {/* Finial highlight */}
            <Ellipse
              cx={16.5}
              cy={47}
              rx={0.6}
              ry={1.4}
              fill="#ffffff"
              opacity={0.4}
            />
            {/* Thread ring at cap base */}
            <Rect x={22} y={44} width={2} height={12} fill={capColor} />
            {/* Translucent tinted barrel */}
            <Rect
              x={24}
              y={44}
              width={46}
              height={12}
              fill={bodyColor}
              fillOpacity={0.18}
              stroke={bodyColor}
              strokeOpacity={0.45}
              strokeWidth={0.5 / penScale}
            />
            {/* Inner ink cartridge — visible through translucent barrel */}
            <Rect
              x={28}
              y={47}
              width={36}
              height={6}
              fill={bodyColor}
              opacity={0.7}
            />
            {/* Cartridge inner highlight */}
            <Rect
              x={28}
              y={48}
              width={34}
              height={0.8}
              fill="#ffffff"
              opacity={0.5}
            />
            {/* Barrel exterior highlight — long white shimmer */}
            <Rect
              x={26}
              y={45}
              width={42}
              height={0.7}
              fill="#ffffff"
              opacity={0.6}
            />
            {/* Black ring above steel */}
            <Rect x={70} y={45} width={2} height={10} fill={capColor} />
            {/* Polished steel grip ring */}
            <Rect x={72} y={45} width={3} height={10} fill={steelDeepColor} />
            {/* Steel highlight (white shine on top edge) */}
            <Rect
              x={72}
              y={45}
              width={3}
              height={1.2}
              fill="#ffffff"
              opacity={0.7}
            />
            {/* Black grip trapezoid */}
            <Path d={GRIP_PATH} fill={capColor} />
            {/* Steel nib triangle */}
            <Path d={NIB_PATH} fill={steelColor} />
            {/* Nib upper-half white shading */}
            <Path d={NIB_SHADING_PATH} fill="#ffffff" opacity={0.45} />
            {/* Nib slit (horizontal in our layout) */}
            <Line
              x1={79}
              y1={50}
              x2={87}
              y2={50}
              stroke={slitColor}
              strokeWidth={0.5 / penScale}
            />
            {/* Breather hole on nib */}
            <Circle cx={80.5} cy={50} r={0.7} fill={slitColor} />
            {/* Yellow tip glow (outer halo) */}
            <Circle
              cx={TIP_CX}
              cy={TIP_CY}
              r={5}
              fill={INK_GLOW_COLOR}
              opacity={0.35}
            />
            {/* Yellow tip ink bead */}
            <Circle cx={TIP_CX} cy={TIP_CY} r={2.6} fill={INK_GLOW_COLOR} />
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
      {/* Wrapped in a Reanimated Animated.View whose opacity tracks          */}
      {/* strokeFade — so the pen and its yellow tip glow fade out together   */}
      {/* with the ink stroke at the end of each cycle.                        */}
      {/* ------------------------------------------------------------------ */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
          },
          penOpacityStyle,
          { pointerEvents: 'none' },
        ]}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: penContainerSize,
              height: penContainerSize,
            },
            penBodyAnimatedStyle,
            { pointerEvents: 'none' },
          ]}
        >
          <Svg
            width={penContainerSize}
            height={penContainerSize}
            viewBox="0 0 100 100"
          >
            {/* Cap finial — rounded dark end */}
            <Path d={FINIAL_PATH} fill={capColor} />
            {/* Finial highlight */}
            <Ellipse
              cx={16.5}
              cy={47}
              rx={0.6}
              ry={1.4}
              fill="#ffffff"
              opacity={0.4}
            />
            {/* Thread ring at cap base */}
            <Rect x={22} y={44} width={2} height={12} fill={capColor} />
            {/* Translucent tinted barrel */}
            <Rect
              x={24}
              y={44}
              width={46}
              height={12}
              fill={bodyColor}
              fillOpacity={0.18}
              stroke={bodyColor}
              strokeOpacity={0.45}
              strokeWidth={0.5 / penScale}
            />
            {/* Inner ink cartridge — visible through translucent barrel */}
            <Rect
              x={28}
              y={47}
              width={36}
              height={6}
              fill={bodyColor}
              opacity={0.7}
            />
            {/* Cartridge inner highlight */}
            <Rect
              x={28}
              y={48}
              width={34}
              height={0.8}
              fill="#ffffff"
              opacity={0.5}
            />
            {/* Barrel exterior highlight — long white shimmer */}
            <Rect
              x={26}
              y={45}
              width={42}
              height={0.7}
              fill="#ffffff"
              opacity={0.6}
            />
            {/* Black ring above steel */}
            <Rect x={70} y={45} width={2} height={10} fill={capColor} />
            {/* Polished steel grip ring */}
            <Rect x={72} y={45} width={3} height={10} fill={steelDeepColor} />
            {/* Steel highlight (white shine on top edge) */}
            <Rect
              x={72}
              y={45}
              width={3}
              height={1.2}
              fill="#ffffff"
              opacity={0.7}
            />
            {/* Black grip trapezoid */}
            <Path d={GRIP_PATH} fill={capColor} />
            {/* Steel nib triangle */}
            <Path d={NIB_PATH} fill={steelColor} />
            {/* Nib upper-half white shading */}
            <Path d={NIB_SHADING_PATH} fill="#ffffff" opacity={0.45} />
            {/* Nib slit (horizontal in our layout) */}
            <Line
              x1={79}
              y1={50}
              x2={87}
              y2={50}
              stroke={slitColor}
              strokeWidth={0.5 / penScale}
            />
            {/* Breather hole on nib */}
            <Circle cx={80.5} cy={50} r={0.7} fill={slitColor} />

            {/* Yellow tip glow (outer halo) */}
            <Circle
              cx={TIP_CX}
              cy={TIP_CY}
              r={5}
              fill={INK_GLOW_COLOR}
              opacity={0.35}
            />
            {/* Yellow tip ink bead */}
            <Circle cx={TIP_CX} cy={TIP_CY} r={2.6} fill={INK_GLOW_COLOR} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
