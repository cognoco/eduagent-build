import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  type SharedValue,
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
  /** Primary color for covers and spine (default: brand violet #8b5cf6) */
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
 * Looping book page-flip animation with 3D perspective. Three pages
 * stagger-flip from right to left using rotateY + perspective, then
 * reset simultaneously. Pure Animated.View — no SVG.
 *
 * Fabric safety: transformOrigin with array syntax + rotateY is used.
 * If transformOrigin doesn't cooperate with rotateY on a specific
 * Fabric build, the fallback is translate-rotate-translate.
 */
export function BookPageFlipAnimation({
  size = 120,
  color = '#8b5cf6',
  testID,
}: BookPageFlipAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();

  const page1 = useSharedValue(0);
  const page2 = useSharedValue(0);
  const page3 = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;

    const easing = Easing.inOut(Easing.ease);

    function buildFlipSequence(staggerDelay: number) {
      return withRepeat(
        withSequence(
          withDelay(
            staggerDelay,
            withTiming(-180, { duration: PAGE_FLIP_MS, easing })
          ),
          withDelay(
            2 * STAGGER_MS - staggerDelay + PAUSE_MS,
            withTiming(-180, { duration: 0 })
          ),
          withTiming(0, { duration: RESET_MS }),
          withDelay(PAUSE_MS, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
    }

    page1.value = buildFlipSequence(0);
    page2.value = buildFlipSequence(STAGGER_MS);
    page3.value = buildFlipSequence(STAGGER_MS * 2);

    return () => {
      cancelAnimation(page1);
      cancelAnimation(page2);
      cancelAnimation(page3);
    };
  }, [reduceMotion, page1, page2, page3]);

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

  function usePageStyle(sv: SharedValue<number>) {
    return useAnimatedStyle(() => {
      const deg = sv.value;
      // At -90deg the page is edge-on: swap to "back" appearance
      // Elevation increases mid-flip for depth
      const midFlip = Math.abs(deg) > 45 && Math.abs(deg) < 135;
      return {
        transform: [{ perspective: 800 }, { rotateY: `${deg}deg` }],
        transformOrigin: ['0%', '50%', 0],
        elevation: midFlip ? 4 : 0,
      };
    });
  }

  const page1Style = usePageStyle(page1);
  const page2Style = usePageStyle(page2);
  const page3Style = usePageStyle(page3);

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

      {/* Page 1 — rotateY flips around the left (spine) edge via transformOrigin */}
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
            backfaceVisibility: 'hidden',
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
            backfaceVisibility: 'hidden',
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
            backfaceVisibility: 'hidden',
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
