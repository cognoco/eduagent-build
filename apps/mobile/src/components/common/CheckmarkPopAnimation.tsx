import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface CheckmarkPopAnimationProps {
  /** Overall size in pixels (default: 80) */
  size?: number;
  /** Stroke color — defaults to success green (#22c55e) */
  color?: string;
  /** Stroke width (default: 3) */
  strokeWidth?: number;
  /** Fired after the animation completes (single-shot) */
  onComplete?: () => void;
  testID?: string;
}

// Circle geometry (viewBox 0 0 80 80)
const CX = 40;
const CY = 40;
const RADIUS = 35;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~219.9

// Checkmark path: bottom-left → vertex → top-right
const CHECK_PATH = 'M 24 42 L 35 53 L 56 30';
// Approximate length: sqrt(11²+11²) + sqrt(21²+23²) ≈ 15.6 + 31.1 ≈ 46.7
const CHECK_LENGTH = 47;

// Timing
const CIRCLE_DRAW_MS = 400;
const CHECK_DELAY_MS = 350;
const CHECK_DRAW_MS = 300;
const BOUNCE_DELAY_MS = 600;

/**
 * Single-shot success animation: circle draws → checkmark draws → scale bounce.
 * Built with react-native-reanimated + react-native-svg. Zero extra deps.
 */
export function CheckmarkPopAnimation({
  size = 80,
  color = '#22c55e',
  strokeWidth = 3,
  onComplete,
  testID,
}: CheckmarkPopAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  const circleOffset = useSharedValue(CIRCUMFERENCE);
  const checkOffset = useSharedValue(CHECK_LENGTH);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      circleOffset.value = 0;
      checkOffset.value = 0;
      onComplete?.();
      return;
    }

    // Phase 1: Draw circle
    circleOffset.value = withTiming(0, {
      duration: CIRCLE_DRAW_MS,
      easing: Easing.inOut(Easing.ease),
    });

    // Phase 2: Draw checkmark (overlaps slightly with circle end)
    checkOffset.value = withDelay(
      CHECK_DELAY_MS,
      withTiming(0, {
        duration: CHECK_DRAW_MS,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      })
    );

    // Phase 3: Scale bounce + fire onComplete
    scale.value = withDelay(
      BOUNCE_DELAY_MS,
      withSequence(
        withSpring(1.1, { damping: 12, stiffness: 180 }),
        withTiming(1, { duration: 100 }, (finished) => {
          if (finished && onComplete) {
            runOnJS(onComplete)();
          }
        })
      )
    );
  }, [reduceMotion, circleOffset, checkOffset, scale, onComplete]);

  const circleAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circleOffset.value,
  }));

  const checkAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: checkOffset.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={containerStyle}
      testID={testID}
      accessibilityLabel="Success"
      accessibilityRole="image"
    >
      <Svg width={size} height={size} viewBox="0 0 80 80">
        <AnimatedCircle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={circleAnimatedProps}
        />
        <AnimatedPath
          d={CHECK_PATH}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LENGTH}
          animatedProps={checkAnimatedProps}
        />
      </Svg>
    </Animated.View>
  );
}
