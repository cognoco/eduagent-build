import { useEffect, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const PATH_LEN = 150;

// Brand colors — use the brighter dark-mode variants for maximum pop
const C = {
  violet: '#8b5cf6',
  teal: '#14b8a6',
  pink: '#f9a8d4',
  ltViolet: '#c4b5fd',
  mint: '#99f6e4',
  lavender: '#f3e8ff',
  ltMint: '#ccfbf1',
  sparkPink: '#fce7f3',
  sparkViolet: '#ede9fe',
  sparkMint: '#d1fae5',
} as const;

type BrandCelebrationProps = {
  /** Diameter of the animation area (default 120) */
  size?: number;
  /** Called when the animation completes (~700ms) */
  onComplete?: () => void;
  testID?: string;
};

/**
 * Brand-themed celebration animation.
 *
 * The Mentomate logo icon performs a fast, explosive celebration:
 * student node pops → path zips → dots explode with sparks →
 * mentor node slams in → achievement ring flashes → happy bounce.
 *
 * ~700ms total. Designed to be addictively satisfying.
 */
export function BrandCelebration({
  size = 120,
  onComplete,
  testID,
}: BrandCelebrationProps) {
  const reduceMotion = useReducedMotion();

  // --- Shared values ---
  const pathDraw = useSharedValue(0);
  const studentR = useSharedValue(0);
  const studentInR = useSharedValue(0);
  const dot1R = useSharedValue(0);
  const dot2R = useSharedValue(0);
  const dot3R = useSharedValue(0);
  const spark1 = useSharedValue(0);
  const spark2 = useSharedValue(0);
  const spark3 = useSharedValue(0);
  const mentorR = useSharedValue(0);
  const mentorInR = useSharedValue(0);
  const ringOp = useSharedValue(0);
  const happyBounce = useSharedValue(1);
  const containerOp = useSharedValue(1);

  const done = useCallback(() => onComplete?.(), [onComplete]);

  useEffect(() => {
    // Accessibility: skip animation entirely
    if (reduceMotion) {
      containerOp.value = 1;
      studentR.value = 15;
      studentInR.value = 6.5;
      dot1R.value = 4;
      dot2R.value = 5;
      dot3R.value = 6;
      mentorR.value = 17;
      mentorInR.value = 7;
      ringOp.value = 0.18;
      pathDraw.value = 1;
      done();
      return;
    }

    // ── FAST, PUNCHY springs ──
    // Lower damping = more overshoot = more satisfying
    const pop = { damping: 4, stiffness: 220 }; // ~40% overshoot
    const slam = { damping: 3, stiffness: 250 }; // ~50% overshoot
    // Easing.out(Easing.cubic) equivalent — avoids jest mock gaps
    const sparkEase = Easing.bezier(0.33, 1, 0.68, 1);

    // 0ms — Student node POPS
    studentR.value = withSpring(15, pop);
    studentInR.value = withDelay(30, withSpring(6.5, pop));

    // 50ms — Path ZIPS across
    pathDraw.value = withDelay(
      50,
      withTiming(1, { duration: 250, easing: Easing.bezier(0.22, 1, 0.36, 1) })
    );

    // 100ms — Dot 1 (pink) EXPLODES
    dot1R.value = withDelay(100, withSpring(4, slam));
    spark1.value = withDelay(
      100,
      withTiming(1, { duration: 350, easing: sparkEase })
    );

    // 150ms — Dot 2 (violet) EXPLODES
    dot2R.value = withDelay(150, withSpring(5, slam));
    spark2.value = withDelay(
      150,
      withTiming(1, { duration: 350, easing: sparkEase })
    );

    // 200ms — Dot 3 (mint) EXPLODES
    dot3R.value = withDelay(200, withSpring(6, slam));
    spark3.value = withDelay(
      200,
      withTiming(1, { duration: 350, easing: sparkEase })
    );

    // 250ms — Mentor node SLAMS in
    mentorR.value = withDelay(250, withSpring(17, slam));
    mentorInR.value = withDelay(280, withSpring(7, pop));

    // 300ms — Achievement ring FLASH
    ringOp.value = withDelay(
      300,
      withSequence(
        withTiming(0.6, { duration: 100 }),
        withTiming(0.18, { duration: 250 })
      )
    );

    // 400ms — Happy bounce (both nodes pulse)
    happyBounce.value = withDelay(
      400,
      withSequence(
        withTiming(0.92, { duration: 80 }),
        withSpring(1, { damping: 6, stiffness: 300 })
      )
    );

    // 700ms — Done
    containerOp.value = withDelay(
      700,
      withTiming(1, { duration: 1 }, (finished) => {
        if (finished) runOnJS(done)();
      })
    );
  }, [done, reduceMotion]);

  // --- Animated props ---
  // Android SVG fix: bundling `opacity` alongside `r` forces native re-renders
  // when starting from r=0. Without this, circles stay invisible on Android.
  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LEN * (1 - pathDraw.value),
    opacity: Math.min(pathDraw.value * 10, 1),
  }));

  const studentOutProps = useAnimatedProps(() => ({
    r: studentR.value * happyBounce.value,
    opacity: Math.min(studentR.value / 2, 1),
  }));
  const studentInProps = useAnimatedProps(() => ({
    r: studentInR.value * happyBounce.value,
    opacity: Math.min(studentInR.value / 1, 1),
  }));
  const mentorOutProps = useAnimatedProps(() => ({
    r: mentorR.value * happyBounce.value,
    opacity: Math.min(mentorR.value / 2, 1),
  }));
  const mentorInProps = useAnimatedProps(() => ({
    r: mentorInR.value * happyBounce.value,
    opacity: Math.min(mentorInR.value / 1, 1),
  }));
  const ringProps = useAnimatedProps(() => ({ opacity: ringOp.value }));

  const dot1Props = useAnimatedProps(() => ({
    r: dot1R.value,
    opacity: Math.min(dot1R.value / 4, 1) * 0.6,
  }));
  const dot2Props = useAnimatedProps(() => ({
    r: dot2R.value,
    opacity: Math.min(dot2R.value / 5, 1) * 0.65,
  }));
  const dot3Props = useAnimatedProps(() => ({
    r: dot3R.value,
    opacity: Math.min(dot3R.value / 6, 1) * 0.7,
  }));

  // --- Spark particles (3 per dot, varied directions) ---
  // Dot 1 sparks (pink, center 33,73)
  const s1a = useAnimatedProps(() => {
    const t = spark1.value;
    return {
      cx: 33 - 12 * t,
      cy: 73 - 12 * t,
      r: 2.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s1b = useAnimatedProps(() => {
    const t = spark1.value;
    return {
      cx: 33 + 14 * t,
      cy: 73 - 6 * t,
      r: 2 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s1c = useAnimatedProps(() => {
    const t = spark1.value;
    return {
      cx: 33 - 4 * t,
      cy: 73 + 14 * t,
      r: 1.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });

  // Dot 2 sparks (violet, center 60,55)
  const s2a = useAnimatedProps(() => {
    const t = spark2.value;
    return {
      cx: 60 + 12 * t,
      cy: 55 - 14 * t,
      r: 2.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s2b = useAnimatedProps(() => {
    const t = spark2.value;
    return {
      cx: 60 - 14 * t,
      cy: 55 - 8 * t,
      r: 2 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s2c = useAnimatedProps(() => {
    const t = spark2.value;
    return {
      cx: 60 + 6 * t,
      cy: 55 + 12 * t,
      r: 1.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });

  // Dot 3 sparks (mint, center 88,37)
  const s3a = useAnimatedProps(() => {
    const t = spark3.value;
    return {
      cx: 88 + 14 * t,
      cy: 37 - 10 * t,
      r: 2.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s3b = useAnimatedProps(() => {
    const t = spark3.value;
    return {
      cx: 88 - 12 * t,
      cy: 37 - 12 * t,
      r: 2 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s3c = useAnimatedProps(() => {
    const t = spark3.value;
    return {
      cx: 88 + 2 * t,
      cy: 37 + 15 * t,
      r: 1.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOp.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]} testID={testID}>
      <Svg width={size} height={size} viewBox="-5 -15 130 130">
        <Defs>
          <LinearGradient id="cel-arc" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0%" stopColor={C.ltViolet} />
            <Stop offset="100%" stopColor={C.mint} />
          </LinearGradient>
        </Defs>

        {/* Growth arc — zips fast */}
        <AnimatedPath
          d="M20,100 C20,55 100,55 100,10"
          fill="none"
          stroke="url(#cel-arc)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${PATH_LEN}`}
          animatedProps={pathProps}
        />

        {/* Spark particles (behind dots) */}
        <AnimatedCircle fill={C.sparkPink} animatedProps={s1a} />
        <AnimatedCircle fill={C.sparkPink} animatedProps={s1b} />
        <AnimatedCircle fill={C.sparkPink} animatedProps={s1c} />
        <AnimatedCircle fill={C.sparkViolet} animatedProps={s2a} />
        <AnimatedCircle fill={C.sparkViolet} animatedProps={s2b} />
        <AnimatedCircle fill={C.sparkViolet} animatedProps={s2c} />
        <AnimatedCircle fill={C.sparkMint} animatedProps={s3a} />
        <AnimatedCircle fill={C.sparkMint} animatedProps={s3b} />
        <AnimatedCircle fill={C.sparkMint} animatedProps={s3c} />

        {/* Stepping stones — EXPLODE with massive overshoot */}
        <AnimatedCircle
          cx={33}
          cy={73}
          fill={C.pink}
          animatedProps={dot1Props}
        />
        <AnimatedCircle
          cx={60}
          cy={55}
          fill={C.ltViolet}
          animatedProps={dot2Props}
        />
        <AnimatedCircle
          cx={88}
          cy={37}
          fill={C.mint}
          animatedProps={dot3Props}
        />

        {/* Student node */}
        <AnimatedCircle
          cx={20}
          cy={100}
          fill={C.violet}
          animatedProps={studentOutProps}
        />
        <AnimatedCircle
          cx={20}
          cy={100}
          fill={C.lavender}
          animatedProps={studentInProps}
        />

        {/* Achievement ring FLASH */}
        <AnimatedCircle
          cx={100}
          cy={10}
          r={22}
          fill="none"
          stroke={C.teal}
          strokeWidth={2}
          animatedProps={ringProps}
        />

        {/* Mentor node */}
        <AnimatedCircle
          cx={100}
          cy={10}
          fill={C.teal}
          animatedProps={mentorOutProps}
        />
        <AnimatedCircle
          cx={100}
          cy={10}
          fill={C.ltMint}
          animatedProps={mentorInProps}
        />
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
