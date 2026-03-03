import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

interface ShimmerSkeletonProps {
  children: ReactNode;
  /** Duration of one shimmer sweep in ms (default: 1200) */
  duration?: number;
  testID?: string;
}

const SHIMMER_BAND_RATIO = 0.4;
const HIGHLIGHT_OPACITY = 0.15;

/**
 * Wraps skeleton placeholder children with an animated shimmer sweep.
 * Uses react-native-svg LinearGradient — no extra dependencies.
 *
 * Usage:
 * ```tsx
 * <ShimmerSkeleton>
 *   <View className="bg-border rounded h-6 w-3/4 mb-3" />
 *   <View className="bg-border rounded h-4 w-1/2" />
 * </ShimmerSkeleton>
 * ```
 */
export function ShimmerSkeleton({
  children,
  duration = 1200,
  testID,
}: ShimmerSkeletonProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(0);

  const bandWidth = Math.max(containerWidth * SHIMMER_BAND_RATIO, 40);

  useEffect(() => {
    if (reduceMotion || containerWidth === 0) return;

    const start = -bandWidth;
    const end = containerWidth + bandWidth;

    translateX.value = start;
    translateX.value = withRepeat(
      withTiming(end, { duration, easing: Easing.linear }),
      -1,
      false
    );
  }, [reduceMotion, containerWidth, bandWidth, duration, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function handleLayout(event: LayoutChangeEvent): void {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  }

  if (reduceMotion) {
    return (
      <View testID={testID} onLayout={handleLayout}>
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} onLayout={handleLayout} style={styles.container}>
      {children}
      {containerWidth > 0 && (
        <Animated.View
          style={[styles.overlay, animatedStyle]}
          pointerEvents="none"
          testID={testID ? `${testID}-shimmer` : undefined}
        >
          <Svg width={bandWidth} height="100%">
            <Defs>
              <LinearGradient id="shimmerGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
                <Stop
                  offset="0.5"
                  stopColor="#ffffff"
                  stopOpacity={String(HIGHLIGHT_OPACITY)}
                />
                <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={String(bandWidth)}
              height="100%"
              fill="url(#shimmerGrad)"
            />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
});
