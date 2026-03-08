import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useReducedMotion,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CelebrationAnimationProps {
  /** Overall size in pixels (default: 120) */
  size?: number;
  /** Primary burst color (default: theme success green) */
  color?: string;
  /** Secondary sparkle color (default: theme accent) */
  accentColor?: string;
  /** Fired after the animation completes */
  onComplete?: () => void;
  testID?: string;
}

// Particle positions (angle in degrees, distance ratio from center)
const PARTICLES = [
  { angle: 0, dist: 1.0 },
  { angle: 45, dist: 0.85 },
  { angle: 90, dist: 1.0 },
  { angle: 135, dist: 0.85 },
  { angle: 180, dist: 1.0 },
  { angle: 225, dist: 0.85 },
  { angle: 270, dist: 1.0 },
  { angle: 315, dist: 0.85 },
  { angle: 22, dist: 0.7 },
  { angle: 67, dist: 0.7 },
  { angle: 112, dist: 0.7 },
  { angle: 157, dist: 0.7 },
];

const BURST_MS = 500;
const FADE_MS = 400;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Celebratory star-burst animation for session completion, streaks, mastery.
 * 12 particles burst outward from center, then fade. Single-shot.
 */
export function CelebrationAnimation({
  size = 120,
  color = '#22c55e',
  accentColor,
  onComplete,
  testID,
}: CelebrationAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  const centerScale = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      opacity.value = 1;
      centerScale.value = 1;
      onComplete?.();
      return;
    }

    // Burst outward (ease-out cubic via bezier)
    progress.value = withTiming(1, {
      duration: BURST_MS,
      easing: Easing.bezier(0, 0, 0.2, 1),
    });

    // Center circle pops
    centerScale.value = withSequence(
      withSpring(1.2, { damping: 8, stiffness: 200 }),
      withTiming(1, { duration: 150 })
    );

    // Fade out after burst
    opacity.value = withDelay(
      BURST_MS,
      withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      })
    );
  }, [reduceMotion, progress, opacity, centerScale, onComplete]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: centerScale.value }],
  }));

  const half = size / 2;
  const maxRadius = half * 0.85;
  const particleR = size * 0.03;
  const innerR = size * 0.025;

  return (
    <Animated.View
      style={[styles.container, containerStyle, { width: size, height: size }]}
      testID={testID}
      accessibilityLabel="Celebration"
      accessibilityRole="image"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {PARTICLES.map((p, i) => {
          const endX = half + Math.cos(toRad(p.angle)) * maxRadius * p.dist;
          const endY = half + Math.sin(toRad(p.angle)) * maxRadius * p.dist;
          const useAccent = i % 3 === 0 && accentColor;
          return (
            <AnimatedParticle
              key={i}
              cx={half}
              cy={half}
              endX={endX}
              endY={endY}
              r={i % 2 === 0 ? particleR : innerR}
              color={useAccent ? accentColor! : color}
              progress={progress}
            />
          );
        })}
      </Svg>
      {/* Center glow circle */}
      <Animated.View
        style={[
          styles.center,
          centerStyle,
          {
            width: size * 0.15,
            height: size * 0.15,
            borderRadius: size * 0.075,
            backgroundColor: color,
            opacity: 0.3,
            left: half - size * 0.075,
            top: half - size * 0.075,
          },
        ]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

function AnimatedParticle({
  cx,
  cy,
  endX,
  endY,
  r,
  color,
  progress,
}: {
  cx: number;
  cy: number;
  endX: number;
  endY: number;
  r: number;
  color: string;
  progress: { value: number };
}): ReactNode {
  const animatedProps = useAnimatedProps(() => ({
    cx: cx + (endX - cx) * progress.value,
    cy: cy + (endY - cy) * progress.value,
    opacity: 1 - progress.value * 0.3,
  }));

  return <AnimatedCircle r={r} fill={color} animatedProps={animatedProps} />;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  center: {
    position: 'absolute',
  },
});
