import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/** Scheme-aware shimmer highlight — visible on both light and dark surfaces */
const SHIMMER_COLOR_LIGHT = 'rgba(0,0,0,0.12)';
const SHIMMER_COLOR_DARK = 'rgba(255,255,255,0.25)';

interface ShimmerSkeletonProps {
  children: ReactNode;
  /** Duration of one shimmer sweep in ms (default: 1200) */
  duration?: number;
  /** Shimmer highlight color (default: scheme-aware) */
  shimmerColor?: string;
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
  shimmerColor,
  testID,
}: ShimmerSkeletonProps): ReactNode {
  // BM-01: unique gradient ID per instance to avoid SVG ID collision
  const gradientId = useId();
  const reduceMotion = useReducedMotion();
  const scheme = useColorScheme();
  const resolvedColor =
    shimmerColor ??
    (scheme === 'dark' ? SHIMMER_COLOR_DARK : SHIMMER_COLOR_LIGHT);
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

    // BR-01: cancel animation on unmount to prevent leaked UI-thread work
    return () => {
      cancelAnimation(translateX);
    };
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
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={resolvedColor} stopOpacity="0" />
                <Stop
                  offset="0.5"
                  stopColor={resolvedColor}
                  stopOpacity={String(HIGHLIGHT_OPACITY)}
                />
                <Stop offset="1" stopColor={resolvedColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={String(bandWidth)}
              height="100%"
              fill={`url(#${gradientId})`}
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
