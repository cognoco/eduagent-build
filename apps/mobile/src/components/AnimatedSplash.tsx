import { useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
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
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width: SCREEN_W } = Dimensions.get('window');
const ICON_SIZE = Math.min(SCREEN_W * 0.44, 180);
const PATH_LEN = 150; // approximate bezier arc length

// Brand colors — dark-mode variants for the deep indigo splash background
const C = {
  bg: '#1e1b4b',
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
  text: '#f1f5f9',
  textViolet: '#a78bfa',
  textTeal: '#5eead4',
} as const;

type AnimatedSplashProps = {
  onComplete: () => void;
};

/**
 * Animated brand splash screen.
 *
 * Sequence (~2.5s):
 *   Student node springs in → path draws → dots burst with spark particles →
 *   mentor node springs in → achievement ring pulses → wordmark fades in →
 *   everything fades out → onComplete.
 *
 * Tap anywhere to skip.
 */
export function AnimatedSplash({ onComplete }: AnimatedSplashProps) {
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
  const wordOp = useSharedValue(0);
  const fade = useSharedValue(1);

  const done = useCallback(() => onComplete(), [onComplete]);

  // Tap to skip
  const skip = useCallback(() => {
    fade.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [done, fade]);

  // --- Choreography ---
  useEffect(() => {
    const spring = { damping: 8, stiffness: 180 };
    const pop = { damping: 5, stiffness: 150 }; // bouncy overshoot = star burst feel
    const ease = Easing.bezier(0.25, 0.1, 0.25, 1);
    const sparkEase = Easing.out(Easing.cubic);

    // 200ms — student node
    studentR.value = withDelay(200, withSpring(15, spring));
    studentInR.value = withDelay(350, withSpring(6.5, spring));

    // 300ms — path draws itself
    pathDraw.value = withDelay(
      300,
      withTiming(1, { duration: 900, easing: ease })
    );

    // 550ms — dot 1 (pink) bursts + sparks fly
    dot1R.value = withDelay(550, withSpring(4, pop));
    spark1.value = withDelay(
      550,
      withTiming(1, { duration: 450, easing: sparkEase })
    );

    // 750ms — dot 2 (violet) bursts
    dot2R.value = withDelay(750, withSpring(5, pop));
    spark2.value = withDelay(
      750,
      withTiming(1, { duration: 450, easing: sparkEase })
    );

    // 950ms — dot 3 (mint) bursts
    dot3R.value = withDelay(950, withSpring(6, pop));
    spark3.value = withDelay(
      950,
      withTiming(1, { duration: 450, easing: sparkEase })
    );

    // 1100ms — mentor node
    mentorR.value = withDelay(1100, withSpring(17, spring));
    mentorInR.value = withDelay(1250, withSpring(7, spring));

    // 1300ms — achievement ring pulses
    ringOp.value = withDelay(
      1300,
      withSequence(
        withTiming(0.35, { duration: 300 }),
        withTiming(0.18, { duration: 400 })
      )
    );

    // 1500ms — wordmark fades in
    wordOp.value = withDelay(1500, withTiming(1, { duration: 400 }));

    // 2500ms — fade out and complete
    fade.value = withDelay(
      2500,
      withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(done)();
      })
    );
  }, []);

  // --- Animated props for SVG elements ---
  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LEN * (1 - pathDraw.value),
  }));

  const studentOutProps = useAnimatedProps(() => ({ r: studentR.value }));
  const studentInProps = useAnimatedProps(() => ({ r: studentInR.value }));
  const mentorOutProps = useAnimatedProps(() => ({ r: mentorR.value }));
  const mentorInProps = useAnimatedProps(() => ({ r: mentorInR.value }));
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

  // Spark particles — 2 per dot, fly outward and fade
  // Dot 1 sparks (pink, center 33,73)
  const s1a = useAnimatedProps(() => {
    const t = spark1.value;
    return {
      cx: 33 - 10 * t,
      cy: 73 - 10 * t,
      r: 2 * Math.max(0, 1 - t * 0.7),
      opacity: Math.max(0, 1 - t),
    };
  });
  const s1b = useAnimatedProps(() => {
    const t = spark1.value;
    return {
      cx: 33 + 10 * t,
      cy: 73 - 5 * t,
      r: 1.5 * Math.max(0, 1 - t * 0.7),
      opacity: Math.max(0, 1 - t),
    };
  });

  // Dot 2 sparks (violet, center 60,55)
  const s2a = useAnimatedProps(() => {
    const t = spark2.value;
    return {
      cx: 60 - 8 * t,
      cy: 55 - 10 * t,
      r: 2 * Math.max(0, 1 - t * 0.7),
      opacity: Math.max(0, 1 - t),
    };
  });
  const s2b = useAnimatedProps(() => {
    const t = spark2.value;
    return {
      cx: 60 + 10 * t,
      cy: 55 - 6 * t,
      r: 1.5 * Math.max(0, 1 - t * 0.7),
      opacity: Math.max(0, 1 - t),
    };
  });

  // Dot 3 sparks (mint, center 88,37)
  const s3a = useAnimatedProps(() => {
    const t = spark3.value;
    return {
      cx: 88 + 10 * t,
      cy: 37 - 10 * t,
      r: 2 * Math.max(0, 1 - t * 0.7),
      opacity: Math.max(0, 1 - t),
    };
  });
  const s3b = useAnimatedProps(() => {
    const t = spark3.value;
    return {
      cx: 88 - 8 * t,
      cy: 37 - 8 * t,
      r: 1.5 * Math.max(0, 1 - t * 0.7),
      opacity: Math.max(0, 1 - t),
    };
  });

  // --- View animated styles ---
  const containerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordOp.value }));

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      testID="animated-splash"
    >
      <Pressable onPress={skip} style={styles.pressable}>
        <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="-5 -15 130 130">
          <Defs>
            <LinearGradient id="splash-arc" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0%" stopColor={C.ltViolet} />
              <Stop offset="100%" stopColor={C.mint} />
            </LinearGradient>
          </Defs>

          {/* Growth arc — draws from student to mentor */}
          <AnimatedPath
            d="M20,100 C20,55 100,55 100,10"
            fill="none"
            stroke="url(#splash-arc)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${PATH_LEN}`}
            animatedProps={pathProps}
          />

          {/* Spark particles (render behind dots so dots sit on top) */}
          <AnimatedCircle fill={C.sparkPink} animatedProps={s1a} />
          <AnimatedCircle fill={C.sparkPink} animatedProps={s1b} />
          <AnimatedCircle fill={C.sparkViolet} animatedProps={s2a} />
          <AnimatedCircle fill={C.sparkViolet} animatedProps={s2b} />
          <AnimatedCircle fill={C.sparkMint} animatedProps={s3a} />
          <AnimatedCircle fill={C.sparkMint} animatedProps={s3b} />

          {/* Stepping stones — spring overshoot gives the "pop" effect */}
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

          {/* Student node (violet) */}
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

          {/* Achievement ring */}
          <AnimatedCircle
            cx={100}
            cy={10}
            r={22}
            fill="none"
            stroke={C.teal}
            strokeWidth={1.5}
            animatedProps={ringProps}
          />

          {/* Mentor node (teal) */}
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

        {/* Wordmark */}
        <Animated.View
          style={[styles.wordmark, wordmarkStyle]}
          testID="splash-wordmark"
        >
          <Text style={styles.mentText}>ment</Text>
          <View style={styles.circleO}>
            <View style={styles.circleODot} />
          </View>
          <Text style={styles.mateText}>mate</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
    zIndex: 999,
    elevation: 999,
  },
  pressable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  mentText: {
    fontFamily: 'AtkinsonHyperlegible_700Bold',
    fontSize: 28,
    color: C.text,
    letterSpacing: -0.5,
  },
  circleO: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.8,
    borderColor: C.textViolet,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    marginBottom: 2, // align with text baseline
  },
  circleODot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.textViolet,
  },
  mateText: {
    fontFamily: 'AtkinsonHyperlegible_700Bold',
    fontSize: 28,
    color: C.textTeal,
    letterSpacing: -0.5,
  },
});
