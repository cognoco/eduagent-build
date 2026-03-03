import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useReducedMotion,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Rect, Line, G } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

interface BookPageFlipAnimationProps {
  /** Overall size in pixels (default: 120) */
  size?: number;
  /** Primary color for covers and spine (default: accent #a855f7) */
  color?: string;
  testID?: string;
}

// ViewBox 0 0 120 120
const BOOK_Y = 25;
const BOOK_H = 70;
const SPINE_X = 60;
const LEFT_X = 12;
const LEFT_W = 44;
const RIGHT_X = 64;
const RIGHT_W = 44;
const PAGE_INSET = 4;
const PAGE_Y = BOOK_Y + PAGE_INSET;
const PAGE_H = BOOK_H - PAGE_INSET * 2;
const PAGE_X = SPINE_X + PAGE_INSET;
const PAGE_W = RIGHT_W - PAGE_INSET * 2;

const COVER_OPACITY = 0.25;
const PAGE_OPACITY = 0.6;
const SPINE_OPACITY = 0.5;

// Timing
const PAGE_FLIP_MS = 500;
const STAGGER_MS = 300;
const PAUSE_MS = 400;
const RESET_MS = 300;

/**
 * Looping book page-flip animation. Three pages stagger-flip from right
 * to left (simulated via scaleX), then reset simultaneously.
 * Built with react-native-reanimated + react-native-svg.
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
          // Hold until all pages flipped + pause
          withDelay(
            2 * STAGGER_MS - staggerDelay + PAUSE_MS,
            withTiming(-1, { duration: 0 })
          ),
          // Reset all pages together
          withTiming(1, { duration: RESET_MS }),
          // Brief pause before next cycle
          withDelay(PAUSE_MS, withTiming(1, { duration: 0 }))
        ),
        -1,
        false
      );
    }

    page1.value = buildFlipSequence(0);
    page2.value = buildFlipSequence(STAGGER_MS);
    page3.value = buildFlipSequence(STAGGER_MS * 2);
  }, [reduceMotion, page1, page2, page3]);

  const page1Props = useAnimatedProps(() => ({
    transform: `translate(${PAGE_X}, 0) scale(${
      page1.value
    }, 1) translate(${-PAGE_X}, 0)`,
  }));

  const page2Props = useAnimatedProps(() => ({
    transform: `translate(${PAGE_X}, 0) scale(${
      page2.value
    }, 1) translate(${-PAGE_X}, 0)`,
  }));

  const page3Props = useAnimatedProps(() => ({
    transform: `translate(${PAGE_X}, 0) scale(${
      page3.value
    }, 1) translate(${-PAGE_X}, 0)`,
  }));

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel="Loading content"
      accessibilityRole="image"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* Left cover */}
        <Rect
          x={LEFT_X}
          y={BOOK_Y}
          width={LEFT_W}
          height={BOOK_H}
          rx={3}
          fill={color}
          opacity={COVER_OPACITY}
        />

        {/* Right cover */}
        <Rect
          x={RIGHT_X}
          y={BOOK_Y}
          width={RIGHT_W}
          height={BOOK_H}
          rx={3}
          fill={color}
          opacity={COVER_OPACITY}
        />

        {/* Pages */}
        <AnimatedG animatedProps={page1Props}>
          <Rect
            x={PAGE_X}
            y={PAGE_Y}
            width={PAGE_W}
            height={PAGE_H}
            fill={color}
            opacity={PAGE_OPACITY}
            rx={1}
          />
        </AnimatedG>

        <AnimatedG animatedProps={page2Props}>
          <Rect
            x={PAGE_X + 2}
            y={PAGE_Y}
            width={PAGE_W - 2}
            height={PAGE_H}
            fill={color}
            opacity={PAGE_OPACITY * 0.8}
            rx={1}
          />
        </AnimatedG>

        <AnimatedG animatedProps={page3Props}>
          <Rect
            x={PAGE_X + 4}
            y={PAGE_Y}
            width={PAGE_W - 4}
            height={PAGE_H}
            fill={color}
            opacity={PAGE_OPACITY * 0.6}
            rx={1}
          />
        </AnimatedG>

        {/* Spine line */}
        <Line
          x1={SPINE_X}
          y1={BOOK_Y}
          x2={SPINE_X}
          y2={BOOK_Y + BOOK_H}
          stroke={color}
          strokeWidth={2}
          opacity={SPINE_OPACITY}
        />
      </Svg>
    </Animated.View>
  );
}
