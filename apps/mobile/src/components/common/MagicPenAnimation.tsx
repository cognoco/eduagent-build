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
            ]}
            pointerEvents="none"
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
            ]}
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
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: penSize,
              height: penSize * 1.5,
            },
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
