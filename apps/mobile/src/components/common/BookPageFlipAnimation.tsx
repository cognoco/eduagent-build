import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

interface BookPageFlipAnimationProps {
  /** Overall size in pixels (default: 120) */
  size?: number;
  /** Primary color for covers and spine (default: accent #a855f7) */
  color?: string;
  testID?: string;
}

// Timing
const PAGE_FLIP_MS = 500;
const STAGGER_MS = 300;
const PAUSE_MS = 400;
const RESET_MS = 300;

const COVER_OPACITY = 0.25;
const PAGE_OPACITY = 0.6;
const SPINE_OPACITY = 0.5;

/**
 * Looping book page-flip animation. Three pages stagger-flip from right
 * to left (simulated via scaleX on Views), then reset simultaneously.
 * Built with react-native-reanimated Views (no SVG — avoids Fabric crash).
 */
export function BookPageFlipAnimation({
  size = 120,
  color = '#a855f7',
  testID,
}: BookPageFlipAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  const page1 = useSharedValue(1);
  const page2 = useSharedValue(1);
  const page3 = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;

    const easing = Easing.inOut(Easing.ease);

    function buildFlipSequence(
      staggerDelay: number
    ): ReturnType<typeof withRepeat> {
      return withRepeat(
        withSequence(
          withDelay(
            staggerDelay,
            withTiming(-1, { duration: PAGE_FLIP_MS, easing })
          ),
          withDelay(
            2 * STAGGER_MS - staggerDelay + PAUSE_MS,
            withTiming(-1, { duration: 0 })
          ),
          withTiming(1, { duration: RESET_MS }),
          withDelay(PAUSE_MS, withTiming(1, { duration: 0 }))
        ),
        -1,
        false
      );
    }

    page1.value = buildFlipSequence(0) as number;
    page2.value = buildFlipSequence(STAGGER_MS) as number;
    page3.value = buildFlipSequence(STAGGER_MS * 2) as number;

    // BR-01: cancel animations on unmount to prevent leaked UI-thread work
    return () => {
      cancelAnimation(page1);
      cancelAnimation(page2);
      cancelAnimation(page3);
    };
  }, [reduceMotion, page1, page2, page3]);

  // transformOrigin 'left center' pivots the scaleX around the left (spine) edge,
  // matching the original SVG translate-scale-translate trick.
  const page1Style = useAnimatedStyle(() => ({
    transform: [{ scaleX: page1.value }],
    transformOrigin: ['0%', '50%', 0],
  }));

  const page2Style = useAnimatedStyle(() => ({
    transform: [{ scaleX: page2.value }],
    transformOrigin: ['0%', '50%', 0],
  }));

  const page3Style = useAnimatedStyle(() => ({
    transform: [{ scaleX: page3.value }],
    transformOrigin: ['0%', '50%', 0],
  }));

  // Proportional layout — all values relative to the logical 120×120 viewbox
  const scale = size / 120;
  const bookY = 25 * scale;
  const bookH = 70 * scale;
  const spineX = 60 * scale;
  const leftX = 12 * scale;
  const leftW = 44 * scale;
  const rightX = 64 * scale;
  const rightW = 44 * scale;
  const pageInset = 4 * scale;
  const pageX = spineX + pageInset;
  const pageY = bookY + pageInset;
  const pageW = rightW - pageInset * 2;
  const pageH = bookH - pageInset * 2;

  return (
    <View
      testID={testID}
      accessibilityLabel="Loading content"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Left cover */}
      <View
        style={{
          position: 'absolute',
          left: leftX,
          top: bookY,
          width: leftW,
          height: bookH,
          borderRadius: 3 * scale,
          backgroundColor: color,
          opacity: COVER_OPACITY,
        }}
      />

      {/* Right cover */}
      <View
        style={{
          position: 'absolute',
          left: rightX,
          top: bookY,
          width: rightW,
          height: bookH,
          borderRadius: 3 * scale,
          backgroundColor: color,
          opacity: COVER_OPACITY,
        }}
      />

      {/* Page 1 — scaleX flips around the left (spine) edge via transformOrigin */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pageX,
            top: pageY,
            width: pageW,
            height: pageH,
            borderRadius: 1 * scale,
            backgroundColor: color,
            opacity: PAGE_OPACITY,
          },
          page1Style,
        ]}
      />

      {/* Page 2 */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pageX + 2 * scale,
            top: pageY,
            width: pageW - 2 * scale,
            height: pageH,
            borderRadius: 1 * scale,
            backgroundColor: color,
            opacity: PAGE_OPACITY * 0.8,
          },
          page2Style,
        ]}
      />

      {/* Page 3 */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pageX + 4 * scale,
            top: pageY,
            width: pageW - 4 * scale,
            height: pageH,
            borderRadius: 1 * scale,
            backgroundColor: color,
            opacity: PAGE_OPACITY * 0.6,
          },
          page3Style,
        ]}
      />

      {/* Spine line */}
      <View
        style={{
          position: 'absolute',
          left: spineX - 1 * scale,
          top: bookY,
          width: 2 * scale,
          height: bookH,
          backgroundColor: color,
          opacity: SPINE_OPACITY,
        }}
      />
    </View>
  );
}
