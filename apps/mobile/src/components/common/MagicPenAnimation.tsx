import { useEffect } from 'react';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
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
import Svg, { Path, Rect, Line } from 'react-native-svg';

// Wrap in try-catch: on some Android release builds (Hermes + Fabric),
// Reanimated's native module can fail to initialize, causing
// createAnimatedComponent to throw. Same pattern as AnimatedSplash.
type AnimatedPathComponent = ComponentType<
  AnimatedProps<ComponentProps<typeof Path>>
>;
let AnimatedPath: AnimatedPathComponent;
let _penAnimationAvailable = true;
try {
  AnimatedPath = Animated.createAnimatedComponent(
    Path
  ) as AnimatedPathComponent;
} catch {
  _penAnimationAvailable = false;
  AnimatedPath = Path as unknown as AnimatedPathComponent;
}

interface MagicPenAnimationProps {
  /** Overall size in pixels (default: 140) */
  size?: number;
  /** Pen/ink color (default: brand teal #0d9488) */
  color?: string;
  testID?: string;
}

// Paper colors by scheme
const PAPER_LIGHT = '#faf5eb';
const PAPER_DARK = '#2a2520';
const PAPER_STROKE_LIGHT = '#e8dcc8';
const PAPER_STROKE_DARK = '#3d3630';
const RULE_LIGHT = '#e0d8c8';
const RULE_DARK = '#3d3630';

// Paper geometry (viewBox 0 0 120 120)
const PAPER_X = 6;
const PAPER_Y = 18;
const PAPER_W = 108;
const PAPER_H = 92;

// Ruled-line Y positions on the paper
const RULED_LINES_Y = [40, 55, 70, 85, 98];

// Writing path — cursive bezier that stays within the paper bounds
const WRITING_PATH = 'M 16 82 C 30 50, 48 94, 62 60 S 90 44, 108 74';
const PATH_LENGTH = 160; // overestimate is safe

// Pen body SVG paths (viewBox 0 0 40 60, pen points downward; rotated 35deg
// in the parent View). The body is drawn slim (x=14..26, 12 wide) so the
// silhouette reads as a tall roller-pen rather than a stubby pencil.
//
// Anatomy (top → bottom in pre-rotation viewBox coords):
//   y= 2..22  cap (rounded top)
//   y=22..24  chrome ring (cap-to-barrel join)
//   y=24..40  upper barrel (solid)
//   y=40..50  ink window (translucent — animated fill rendered here)
//   y=50..52  chrome grip ring
//   y=52..56  section cone (taper)
//   y=56..60  metallic nib tip
const PEN_CAP = 'M16 4 Q20 1 24 4 L26 22 L14 22 Z';
const PEN_BARREL = 'M14 24 L26 24 L26 40 L14 40 Z';
const PEN_SECTION = 'M14 52 L26 52 L22 56 L18 56 Z';
const PEN_NIB = 'M18 56 L22 56 L20 60 Z';
// Chrome clip silhouette on the cap (right side, with characteristic fold)
const PEN_CLIP = 'M23 5 L23 17 L24 19 L23 21';

// Chrome accents (fixed metallic tone — independent of pen color so cap clip
// and grip rings still read as metal in any theme).
const CHROME_FILL = '#cbd5e1';
const CHROME_STROKE = '#475569';

// Ink window inside barrel (viewBox coords) — middle of the pen body so the
// depleting ink level is visible right where the user expects on a roller pen.
const INK_WIN_X = 15;
const INK_WIN_Y = 40;
const INK_WIN_W = 10;
const INK_WIN_H = 10;

// Pen follower endpoints (start/end of writing path)
const PEN_START_X = 16;
const PEN_START_Y = 82;
const PEN_END_X = 108;
const PEN_END_Y = 74;

// Timing
const DRAW_MS = 1500;
const PAUSE_MS = 600;
const RESET_MS = 300;

// Glow color for nib
const NIB_GLOW = '#fbbf24';

/**
 * Magic pen animation: a slim roller-pen writes on a sheet of paper.
 * The ink stroke appears on the paper as the pen moves, and the ink level
 * inside the pen barrel visibly depletes from ~95% → ~25%.
 *
 * <48px: paper + minimal pen body (no enhanced details).
 * 48px+: full effect — chrome cap clip, ink window with depleting level,
 *        chrome grip ring, metallic nib, droplets, nib glow, paper fold.
 */
export function MagicPenAnimation({
  size = 140,
  color = '#0d9488',
  testID,
}: MagicPenAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const animationDisabled = reduceMotion || !_penAnimationAvailable;
  const isDark = useColorScheme() === 'dark';
  const showEnhanced = size >= 48;

  const paperFill = isDark ? PAPER_DARK : PAPER_LIGHT;
  const paperStroke = isDark ? PAPER_STROKE_DARK : PAPER_STROKE_LIGHT;
  const ruleColor = isDark ? RULE_DARK : RULE_LIGHT;

  const progress = useSharedValue(animationDisabled ? 1 : 0);
  // Ink droplet shared values (only animated at >= 80px)
  const drop1Y = useSharedValue(0);
  const drop1Op = useSharedValue(0);
  const drop2Y = useSharedValue(0);
  const drop2Op = useSharedValue(0);

  useEffect(() => {
    if (animationDisabled) {
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

    // Ink droplets (>= 80px only)
    if (showEnhanced) {
      drop1Y.value = withRepeat(
        withSequence(
          withDelay(400, withTiming(10, { duration: 600 })),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
      drop1Op.value = withRepeat(
        withSequence(
          withDelay(400, withTiming(0.6, { duration: 100 })),
          withTiming(0, { duration: 500 }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
      drop2Y.value = withRepeat(
        withSequence(
          withDelay(900, withTiming(12, { duration: 500 })),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
      drop2Op.value = withRepeat(
        withSequence(
          withDelay(900, withTiming(0.5, { duration: 100 })),
          withTiming(0, { duration: 400 }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    }

    return () => {
      cancelAnimation(progress);
      cancelAnimation(drop1Y);
      cancelAnimation(drop1Op);
      cancelAnimation(drop2Y);
      cancelAnimation(drop2Op);
    };
  }, [
    animationDisabled,
    progress,
    showEnhanced,
    drop1Y,
    drop1Op,
    drop2Y,
    drop2Op,
  ]);

  // Ink stroke — strokeDashoffset trick (proven Fabric-safe)
  const pathAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - progress.value),
  }));

  // Pen position — Animated.View overlay (proven Fabric-safe)
  const scale = size / 120;
  // Pen takes ~38% of canvas width so the barrel, grip, nib, AND ink window
  // are all legible. At 25% the pen rendered as a 4px-wide barrel — the
  // user only saw the nib tip.
  const penSize = size * 0.38;
  const penScaleFactor = penSize / 40; // viewBox 0 0 40 60 → pixel

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

  // Ink level inside barrel — depletes as pen writes. Drains from 95% → 25%
  // so the falling ink line is clearly visible even at the small (48px) idle
  // size where the window is only ~4px tall on screen.
  const inkLevelStyle = useAnimatedStyle(() => {
    const inkPercent = 0.95 - progress.value * 0.7;
    return {
      height: INK_WIN_H * penScaleFactor * inkPercent,
      top: (INK_WIN_Y + INK_WIN_H * (1 - inkPercent)) * penScaleFactor,
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
    opacity: animationDisabled ? 0 : 0.4 * progress.value,
    transform: [
      {
        translateX:
          (PEN_START_X + (PEN_END_X - PEN_START_X) * progress.value) * scale -
          6,
      },
      {
        translateY:
          (PEN_START_Y + (PEN_END_Y - PEN_START_Y) * progress.value) * scale -
          4,
      },
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
        {/* Paper background */}
        <Rect
          x={PAPER_X}
          y={PAPER_Y}
          width={PAPER_W}
          height={PAPER_H}
          rx={4}
          fill={paperFill}
          stroke={paperStroke}
          strokeWidth={0.8}
        />

        {/* Ruled lines */}
        {RULED_LINES_Y.map((y) => (
          <Line
            key={y}
            x1={PAPER_X + 8}
            y1={y}
            x2={PAPER_X + PAPER_W - 8}
            y2={y}
            stroke={ruleColor}
            strokeWidth={0.5}
            opacity={0.6}
          />
        ))}

        {/* Page fold corner (80px+ detail) */}
        {showEnhanced && (
          <Path
            d={`M${PAPER_X + PAPER_W - 12} ${PAPER_Y} L${PAPER_X + PAPER_W} ${
              PAPER_Y + 12
            } L${PAPER_X + PAPER_W} ${PAPER_Y}`}
            fill={paperStroke}
            opacity={0.3}
          />
        )}

        {/* Writing guide line (very faint) */}
        <Path
          d={WRITING_PATH}
          fill="none"
          stroke={color}
          strokeWidth={2.5 * 0.3}
          strokeLinecap="round"
          opacity={0.1}
        />

        {/* Ink trail — wider, faded duplicate behind main stroke (>= 80px) */}
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

        {/* Animated ink stroke on paper */}
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
      {showEnhanced && !animationDisabled && (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: size * 0.45,
                top: size * 0.6,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: color,
              },
              drop1Style,
              { pointerEvents: 'none' },
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: size * 0.55,
                top: size * 0.5,
                width: 3,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: color,
              },
              drop2Style,
              { pointerEvents: 'none' },
            ]}
          />
        </>
      )}

      {/* Nib glow — Animated.View, only at >= 80px */}
      {showEnhanced && !animationDisabled && (
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
            { pointerEvents: 'none' },
          ]}
        />
      )}

      {/* Pen body — Animated.View overlay with static SVG inside */}
      {!animationDisabled && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: penSize,
              height: penSize * 1.5,
            },
            penStyle,
            { pointerEvents: 'none' },
          ]}
        >
          <Svg width={penSize} height={penSize * 1.5} viewBox="0 0 40 60">
            {/* Cap — darker shade of pen color (top of pen, before chrome ring) */}
            <Path d={PEN_CAP} fill={color} opacity={0.95} />
            {/* Chrome clip on cap (right side) */}
            <Path
              d={PEN_CLIP}
              fill="none"
              stroke={CHROME_FILL}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Chrome ring at cap-barrel join */}
            <Rect
              x={14}
              y={22}
              width={12}
              height={2}
              fill={CHROME_FILL}
              stroke={CHROME_STROKE}
              strokeWidth={0.3}
            />
            {/* Upper barrel — main pen body color */}
            <Path d={PEN_BARREL} fill={color} opacity={0.9} />
            {/* Ink window background — translucent so ink fill below shows. */}
            <Rect
              x={INK_WIN_X}
              y={INK_WIN_Y}
              width={INK_WIN_W}
              height={INK_WIN_H}
              rx={1}
              fill={color}
              opacity={0.18}
            />
            {/* Window outline ridges — top + bottom thin rings give the
                window a "tube" feel and frame the ink level. */}
            <Line
              x1={14}
              y1={40}
              x2={26}
              y2={40}
              stroke={color}
              strokeWidth={0.6}
              opacity={0.6}
            />
            <Line
              x1={14}
              y1={50}
              x2={26}
              y2={50}
              stroke={color}
              strokeWidth={0.6}
              opacity={0.6}
            />
            {/* Chrome grip ring below the ink window */}
            <Rect
              x={14}
              y={50}
              width={12}
              height={2}
              fill={CHROME_FILL}
              stroke={CHROME_STROKE}
              strokeWidth={0.3}
            />
            {/* Section cone tapering to nib */}
            <Path d={PEN_SECTION} fill={color} opacity={0.85} />
            {/* Metallic nib tip */}
            <Path
              d={PEN_NIB}
              fill={CHROME_FILL}
              stroke={CHROME_STROKE}
              strokeWidth={0.3}
            />
          </Svg>

          {/* Ink level fill overlay — animated height. Always rendered (the
              depleting level is the signature behavior of the pen). Higher
              opacity than before so the falling level reads at 48px. */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: INK_WIN_X * penScaleFactor,
                width: INK_WIN_W * penScaleFactor,
                borderRadius: 1,
                backgroundColor: color,
                opacity: 0.85,
              },
              inkLevelStyle,
              { pointerEvents: 'none' },
            ]}
          />
          {/* Subtle highlight on the ink fill (mimics liquid meniscus) */}
          {/* [BUG-922] Move pointerEvents into style — props.pointerEvents is
              deprecated on React Native Web. */}
          <View
            style={{
              position: 'absolute',
              left: (INK_WIN_X + 0.5) * penScaleFactor,
              width: (INK_WIN_W - 1) * penScaleFactor,
              top: (INK_WIN_Y + 0.5) * penScaleFactor,
              height: 0.6 * penScaleFactor,
              backgroundColor: '#ffffff',
              opacity: 0.25,
              borderRadius: 1,
              pointerEvents: 'none',
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}
