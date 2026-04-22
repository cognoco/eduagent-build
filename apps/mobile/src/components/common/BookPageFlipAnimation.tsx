import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
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
import Svg, { Rect, Line, Path } from 'react-native-svg';

interface BookPageFlipAnimationProps {
  /** Overall size in pixels (default: 120) */
  size?: number;
  /** Cover color (default: brand violet #8b5cf6) */
  color?: string;
  testID?: string;
}

// Timing
const FLIP_MS = 800;
const PAUSE_AFTER_FLIP_MS = 600;
const STAGGER_MS = 900;

// Decorative colors
const GLOW_COLOR = '#fbbf24';
const RIBBON_COLOR = '#d4a73a';

// Paper colors by color scheme
const PAPER_LIGHT = '#faf5eb';
const PAPER_DARK = '#2a2520';
const LINE_LIGHT = '#d4c4a8';
const LINE_DARK = '#4a3f35';

// Text line Y positions on the static pages (viewBox 0 0 120 120)
const TEXT_LINES_Y = [36, 44, 52, 60, 68, 76, 84];

// Text line Y positions inside the turning page (viewBox 0 0 43 70)
const TURN_TEXT_LINES_Y = [10, 18, 26, 34, 42, 50, 58];

/**
 * Enchanted open book with page-turn animation, warm glow, and sparkle
 * particles. Designed to look like a storybook, not just colored rectangles.
 *
 * The book is an SVG illustration with detailed covers, cream pages, text
 * hints, a bookmark ribbon, and decorative borders. Two pages take turns
 * flipping from right to left using rotateY + perspective.
 *
 * 80px: basic book + page flip + glow
 * 120px: adds sparkles, ribbon, decorative cover border
 */
export function BookPageFlipAnimation({
  size = 120,
  color = '#8b5cf6',
  testID,
}: BookPageFlipAnimationProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const isDark = useColorScheme() === 'dark';
  const showEnhanced = size >= 100;

  const paperFill = isDark ? PAPER_DARK : PAPER_LIGHT;
  const lineColor = isDark ? LINE_DARK : LINE_LIGHT;

  // --- Shared values ---
  const page1Rot = useSharedValue(0);
  const page2Rot = useSharedValue(0);
  const glowOp = useSharedValue(0.12);
  // Sparkles (enhanced only)
  const spark1 = useSharedValue(0);
  const spark2 = useSharedValue(0);
  const spark3 = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;

    const easing = Easing.inOut(Easing.cubic);

    // Cycle duration must be identical for both pages so withRepeat stays in sync.
    // Total per cycle: FLIP_MS + PAUSE_AFTER_FLIP_MS + STAGGER_MS = 2300ms
    page1Rot.value = withRepeat(
      withSequence(
        withTiming(-180, { duration: FLIP_MS, easing }),
        withDelay(PAUSE_AFTER_FLIP_MS, withTiming(0, { duration: 0 })),
        withDelay(STAGGER_MS, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );

    page2Rot.value = withRepeat(
      withSequence(
        withDelay(STAGGER_MS, withTiming(-180, { duration: FLIP_MS, easing })),
        withDelay(PAUSE_AFTER_FLIP_MS, withTiming(0, { duration: 0 })),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );

    // Warm glow pulsing
    glowOp.value = withRepeat(
      withSequence(
        withTiming(0.28, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.08, {
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      true
    );

    // Sparkles (enhanced only)
    if (showEnhanced) {
      spark1.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0, { duration: 800 }),
          withDelay(400, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
      spark2.value = withRepeat(
        withSequence(
          withDelay(600, withTiming(1, { duration: 700 })),
          withTiming(0, { duration: 700 }),
          withDelay(600, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
      spark3.value = withRepeat(
        withSequence(
          withDelay(1200, withTiming(1, { duration: 600 })),
          withTiming(0, { duration: 600 }),
          withDelay(600, withTiming(0, { duration: 0 }))
        ),
        -1,
        false
      );
    }

    return () => {
      cancelAnimation(page1Rot);
      cancelAnimation(page2Rot);
      cancelAnimation(glowOp);
      cancelAnimation(spark1);
      cancelAnimation(spark2);
      cancelAnimation(spark3);
    };
  }, [
    reduceMotion,
    page1Rot,
    page2Rot,
    glowOp,
    spark1,
    spark2,
    spark3,
    showEnhanced,
  ]);

  // --- Derived layout ---
  const s = size / 120; // viewBox → pixel scale
  // Turning page overlay matches the right page area
  const turnPageLeft = 62 * s; // spine right edge
  const turnPageTop = 25 * s;
  const turnPageW = 45 * s; // slightly wider than page to reach cover edge
  const turnPageH = 70 * s;

  // Glow dimensions
  const glowW = size * 0.7;
  const glowH = size * 0.55;

  // Sparkle dot size
  const dotSize = Math.max(4, size * 0.05);

  // --- Animated styles ---
  function usePageStyle(sv: SharedValue<number>) {
    return useAnimatedStyle(() => ({
      transform: [{ perspective: size * 4 }, { rotateY: `${sv.value}deg` }],
      transformOrigin: ['0%', '50%', 0],
    }));
  }

  const page1Style = usePageStyle(page1Rot);
  const page2Style = usePageStyle(page2Rot);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOp.value,
  }));

  function useSparkleStyle(sv: SharedValue<number>) {
    return useAnimatedStyle(() => ({
      opacity: sv.value * 0.8,
      transform: [{ scale: 0.4 + sv.value * 0.6 }],
    }));
  }

  const spark1Style = useSparkleStyle(spark1);
  const spark2Style = useSparkleStyle(spark2);
  const spark3Style = useSparkleStyle(spark3);

  return (
    <View
      testID={testID}
      accessibilityLabel="Loading content"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {/* Warm glow behind book */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: glowW,
            height: glowH,
            borderRadius: glowH / 2,
            backgroundColor: GLOW_COLOR,
            left: (size - glowW) / 2,
            top: size * 0.25,
          },
          glowStyle,
          { pointerEvents: 'none' },
        ]}
      />

      {/* Book illustration — static SVG */}
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* Left cover */}
        <Rect
          x={10}
          y={22}
          width={48}
          height={76}
          rx={3}
          fill={color}
          opacity={0.85}
        />
        {/* Right cover */}
        <Rect
          x={62}
          y={22}
          width={48}
          height={76}
          rx={3}
          fill={color}
          opacity={0.85}
        />
        {/* Spine — slightly taller for ridge effect */}
        <Rect x={58} y={20} width={4} height={80} rx={1} fill={color} />

        {/* Left page */}
        <Rect x={13} y={25} width={43} height={70} rx={1} fill={paperFill} />
        {/* Right page (static background underneath turning pages) */}
        <Rect x={64} y={25} width={43} height={70} rx={1} fill={paperFill} />

        {/* Text lines — left page */}
        {TEXT_LINES_Y.map((y) => (
          <Line
            key={`l${y}`}
            x1={17}
            y1={y}
            x2={52}
            y2={y}
            stroke={lineColor}
            strokeWidth={1}
            opacity={0.4}
          />
        ))}
        {/* Text lines — right page */}
        {TEXT_LINES_Y.map((y) => (
          <Line
            key={`r${y}`}
            x1={68}
            y1={y}
            x2={103}
            y2={y}
            stroke={lineColor}
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {/* Bookmark ribbon (enhanced detail) */}
        {showEnhanced && (
          <Path
            d="M57 20 L57 38 L54 33 M57 38 L60 33"
            stroke={RIBBON_COLOR}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
        )}

        {/* Decorative cover inset borders (enhanced detail) */}
        {showEnhanced && (
          <>
            <Rect
              x={12}
              y={24}
              width={45}
              height={72}
              rx={2}
              fill="none"
              stroke={color}
              strokeWidth={0.5}
              opacity={0.25}
            />
            <Rect
              x={63}
              y={24}
              width={45}
              height={72}
              rx={2}
              fill="none"
              stroke={color}
              strokeWidth={0.5}
              opacity={0.25}
            />
          </>
        )}
      </Svg>

      {/* Turning page 1 — rotateY around the spine edge */}
      {!reduceMotion && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: turnPageLeft,
              top: turnPageTop,
              width: turnPageW,
              height: turnPageH,
              backfaceVisibility: 'hidden',
            },
            page1Style,
            { pointerEvents: 'none' },
          ]}
        >
          <Svg width={turnPageW} height={turnPageH} viewBox="0 0 45 70">
            <Rect x={2} y={0} width={43} height={70} rx={1} fill={paperFill} />
            {TURN_TEXT_LINES_Y.map((y) => (
              <Line
                key={y}
                x1={6}
                y1={y}
                x2={41}
                y2={y}
                stroke={lineColor}
                strokeWidth={0.8}
                opacity={0.35}
              />
            ))}
          </Svg>
        </Animated.View>
      )}

      {/* Turning page 2 — staggered for continuous reading rhythm */}
      {!reduceMotion && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: turnPageLeft,
              top: turnPageTop,
              width: turnPageW,
              height: turnPageH,
              backfaceVisibility: 'hidden',
            },
            page2Style,
            { pointerEvents: 'none' },
          ]}
        >
          <Svg width={turnPageW} height={turnPageH} viewBox="0 0 45 70">
            <Rect x={2} y={0} width={43} height={70} rx={1} fill={paperFill} />
            {TURN_TEXT_LINES_Y.map((y) => (
              <Line
                key={y}
                x1={6}
                y1={y}
                x2={41}
                y2={y}
                stroke={lineColor}
                strokeWidth={0.8}
                opacity={0.25}
              />
            ))}
          </Svg>
        </Animated.View>
      )}

      {/* Sparkle particles (enhanced only) */}
      {showEnhanced && !reduceMotion && (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: size * 0.86,
                top: size * 0.14,
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              spark1Style,
              { pointerEvents: 'none' },
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: size * 0.06,
                top: size * 0.2,
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              spark2Style,
              { pointerEvents: 'none' },
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: size * 0.8,
                top: size * 0.9,
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: GLOW_COLOR,
              },
              spark3Style,
              { pointerEvents: 'none' },
            ]}
          />
        </>
      )}
    </View>
  );
}
