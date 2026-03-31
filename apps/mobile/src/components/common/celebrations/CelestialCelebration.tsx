import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

interface CelestialCelebrationProps {
  color: string;
  accentColor: string;
  testID?: string;
  onComplete?: () => void;
  children?: ReactNode;
}

export function CelestialCelebration({
  color,
  accentColor,
  onComplete,
  testID,
  children,
}: CelestialCelebrationProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.85);
  const translateY = useSharedValue(reduceMotion ? 0 : 8);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (reduceMotion) {
      onCompleteRef.current?.();
      return;
    }

    opacity.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.ease) }),
      withTiming(
        0,
        { duration: 240, easing: Easing.in(Easing.ease) },
        (finished) => {
          if (finished && onCompleteRef.current) {
            runOnJS(onCompleteRef.current)();
          }
        }
      )
    );
    scale.value = withSequence(
      withTiming(1.06, { duration: 220 }),
      withTiming(1, { duration: 200 })
    );
    translateY.value = withSequence(
      withTiming(-6, { duration: 220 }),
      withTiming(0, { duration: 200 })
    );
  }, [opacity, reduceMotion, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, animatedStyle]}
      pointerEvents="none"
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="Celebration animation"
    >
      <Svg width={180} height={180} viewBox="0 0 180 180">
        <Circle cx="90" cy="90" r="26" fill={color} opacity="0.12" />
        <Circle cx="90" cy="90" r="12" fill={accentColor} opacity="0.24" />
        <Line
          x1="90"
          y1="24"
          x2="90"
          y2="54"
          stroke={accentColor}
          strokeWidth="4"
        />
        <Line
          x1="90"
          y1="126"
          x2="90"
          y2="156"
          stroke={accentColor}
          strokeWidth="4"
        />
        <Line
          x1="24"
          y1="90"
          x2="54"
          y2="90"
          stroke={accentColor}
          strokeWidth="4"
        />
        <Line
          x1="126"
          y1="90"
          x2="156"
          y2="90"
          stroke={accentColor}
          strokeWidth="4"
        />
        <Path
          d="M90 42 L96 60 L116 60 L100 72 L106 92 L90 80 L74 92 L80 72 L64 60 L84 60 Z"
          fill={color}
          opacity="0.9"
        />
        {children}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
