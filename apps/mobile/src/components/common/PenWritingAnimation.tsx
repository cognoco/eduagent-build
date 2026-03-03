import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface PenWritingAnimationProps {
  /** Overall size in pixels (default: 120) */
  size?: number;
  /** Stroke color — defaults to theme accent (#a855f7) */
  color?: string;
  /** Line thickness (default: 2.5) */
  strokeWidth?: number;
  testID?: string;
}

// Cursive-like bezier path (viewBox 0 0 120 120)
const WRITING_PATH = 'M 15 80 C 30 20, 50 100, 65 50 S 95 20, 105 60';

// Approximate path length (measured from the bezier)
const PATH_LENGTH = 140;

// Pen follower endpoints (start and end of the writing path)
const PEN_START_X = 15;
const PEN_START_Y = 80;
const PEN_END_X = 105;
const PEN_END_Y = 60;

// Pen nib shape: small downward-pointing triangle (tip at bottom)
const PEN_TIP = '-4,-12 4,-12 0,0';

// Timing
const DRAW_MS = 1500;
const PAUSE_MS = 600;
const RESET_MS = 300;

/**
 * Looping pen-writing animation: a pen nib follows a cursive SVG path
 * as it draws itself. Built with react-native-reanimated + react-native-svg.
 *
 * The stroke uses the strokeDashoffset trick. The pen nib linearly
 * interpolates between the path's start and end points.
 */
export function PenWritingAnimation({
  size = 120,
  color = '#a855f7',
  strokeWidth = 2.5,
  testID,
}: PenWritingAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  // 0 = fully hidden, 1 = fully drawn
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        // Draw: 0 → 1
        withTiming(1, {
          duration: DRAW_MS,
          easing: Easing.inOut(Easing.ease),
        }),
        // Pause at fully drawn
        withDelay(PAUSE_MS, withTiming(1, { duration: 0 })),
        // Reset: 1 → 0
        withTiming(0, { duration: RESET_MS })
      ),
      -1,
      false
    );
  }, [reduceMotion, progress]);

  const pathAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - progress.value),
  }));

  // Pen nib follows the progress linearly between start and end
  const penStyle = useAnimatedStyle(() => {
    const x = PEN_START_X + (PEN_END_X - PEN_START_X) * progress.value;
    const y = PEN_START_Y + (PEN_END_Y - PEN_START_Y) * progress.value;
    const scale = size / 120;
    return {
      transform: [
        { translateX: x * scale },
        { translateY: (y - 12) * scale },
        { scale },
      ],
      opacity: reduceMotion ? 0 : 1,
    };
  });

  return (
    <View
      testID={testID}
      style={styles.container}
      accessibilityLabel="Writing animation"
      accessibilityRole="image"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* Writing line background (faint guide) */}
        <Path
          d={WRITING_PATH}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth * 0.3}
          strokeLinecap="round"
          opacity={0.15}
        />
        {/* Animated writing line */}
        <AnimatedPath
          d={WRITING_PATH}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={PATH_LENGTH}
          animatedProps={pathAnimatedProps}
        />
      </Svg>
      {/* Pen nib — absolutely positioned, follows the stroke endpoint */}
      {!reduceMotion && (
        <Animated.View style={[styles.pen, penStyle]} pointerEvents="none">
          <Svg width={8} height={12} viewBox="-4 -12 8 12">
            <Polygon points={PEN_TIP} fill={color} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  pen: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
