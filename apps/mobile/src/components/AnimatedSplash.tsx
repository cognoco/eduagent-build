import type { ComponentType } from 'react';
import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  useColorScheme,
} from 'react-native';
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
import { tokens } from '../lib/design-tokens';

// Wrap in try-catch: on some Android release builds (Hermes + Fabric),
// Reanimated's native module can fail to initialize, causing
// createAnimatedComponent to throw. A module-level crash here kills the
// entire root layout import chain — no error boundary can catch it.
// Reanimated's createAnimatedComponent return type widens SVG props with
// SharedValue<T> variants that aren't compatible with the bare-props type
// the JSX call sites need. ComponentType<Record<string, unknown>> is the
// structural shape that accepts both the wrapped component and the plain-
// component fallback while avoiding `any`.
let AnimatedCircle: ComponentType<Record<string, unknown>>;
let AnimatedPath: ComponentType<Record<string, unknown>>;
let _splashAnimationAvailable = true;
try {
  AnimatedCircle = Animated.createAnimatedComponent(Circle);
  AnimatedPath = Animated.createAnimatedComponent(Path);
} catch (e) {
  _splashAnimationAvailable = false;
  // Assign plain SVG components as fallback so the rest of the module
  // evaluates without errors. The component will bail out immediately.
  AnimatedCircle = Circle as never;
  AnimatedPath = Path as never;
  console.error('[AnimatedSplash] createAnimatedComponent failed:', e);
}

const { width: SCREEN_W } = Dimensions.get('window');
const ICON_SIZE = Math.min(SCREEN_W * 0.44, 180);
const PATH_LEN = 150; // approximate bezier arc length

/**
 * Brand-accurate splash colors.
 *
 * These are hardcoded to match the canonical brand SVGs (docs/logo.svg,
 * logo-icon-light.svg, logo-icon-dark.svg) rather than derived from theme
 * tokens, because the splash is a fixed brand-identity moment that should
 * not shift with accent presets.
 *
 * Background is the only value taken from tokens so the splash blends
 * seamlessly into the app surface that follows.
 */
function useSplashColors(isDark: boolean) {
  return useMemo(() => {
    const bg = tokens[isDark ? 'dark' : 'light'].colors.background;

    if (isDark) {
      return {
        bg,
        violet: '#8b5cf6', // student node — same in both modes
        teal: '#14b8a6', // mentor node (brand teal, brighter for dark)
        pink: '#f9a8d4', // dot 1 — pastel pink for dark
        ltViolet: '#c4b5fd', // dot 2 — light violet for dark
        mint: '#99f6e4', // dot 3 — pastel mint for dark
        lavender: '#f3e8ff', // student inner fill
        ltMint: '#ccfbf1', // mentor inner fill
        sparkPink: '#f9a8d4',
        sparkViolet: '#c4b5fd',
        sparkMint: '#99f6e4',
        text: '#faf5ee', // "ment" — cream (light-mode bg as text)
        textViolet: '#a78bfa', // circle-O
        textTeal: '#5eead4', // "mate" — light teal
      };
    }

    return {
      bg,
      violet: '#8b5cf6', // student node
      teal: '#0d9488', // mentor node (brand teal)
      pink: '#f472b6', // dot 1 — pink
      ltViolet: '#a78bfa', // dot 2 — light violet
      mint: '#5eead4', // dot 3 — mint
      lavender: '#f3e8ff', // student inner fill
      ltMint: '#ccfbf1', // mentor inner fill
      sparkPink: '#f472b6',
      sparkViolet: '#a78bfa',
      sparkMint: '#5eead4',
      text: '#1a1a3e', // "ment" — dark navy (dark-mode bg as text)
      textViolet: '#8b5cf6', // circle-O
      textTeal: '#0d9488', // "mate" — teal
    };
  }, [isDark]);
}

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
  if (__DEV__) console.log('[Splash] AnimatedSplash MOUNTED');

  const systemScheme = useColorScheme();
  const isDark = systemScheme === 'dark';
  const C = useSplashColors(isDark);
  const reduceMotion = useReducedMotion();
  if (__DEV__)
    console.log('[Splash] reduceMotion=', reduceMotion, 'isDark=', isDark);

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
  const [acceptsTouches, setAcceptsTouches] = useState(true);

  // Use a ref so the effect closure always calls the latest onComplete
  // without re-triggering the animation choreography on prop identity changes.
  const onCompleteRef = useRef(onComplete);
  const completionDeliveredRef = useRef(false);
  onCompleteRef.current = onComplete;
  const done = useCallback(() => {
    if (completionDeliveredRef.current) return;
    completionDeliveredRef.current = true;
    if (__DEV__)
      console.log('[Splash] done() called — animation completed normally');
    setAcceptsTouches(false);
    onCompleteRef.current();
  }, []);

  // Tap to skip
  const skip = useCallback(() => {
    setAcceptsTouches(false);
    fade.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [done, fade]);

  // --- Choreography ---
  useEffect(() => {
    if (__DEV__)
      console.log(
        '[Splash] choreography useEffect fired, reduceMotion=',
        reduceMotion,
      );

    // If Reanimated native init failed, skip animation entirely.
    if (!_splashAnimationAvailable) {
      if (__DEV__)
        console.warn('[Splash] Animation unavailable — completing immediately');
      setAcceptsTouches(false);
      done();
      return;
    }

    // Accessibility: skip animation for users who prefer reduced motion
    if (reduceMotion) {
      if (__DEV__)
        console.warn('[Splash] reduceMotion=true — skipping animation');
      setAcceptsTouches(false);
      fade.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(done)();
      });
      return;
    }

    const spring = { damping: 8, stiffness: 180 };
    const pop = { damping: 5, stiffness: 150 }; // bouncy overshoot = star burst feel
    const ease = Easing.bezier(0.25, 0.1, 0.25, 1);
    // Easing.out(Easing.cubic) equivalent — Easing.out may not be available
    const sparkEase = Easing.bezier(0.33, 1, 0.68, 1);

    // 200ms — student node
    studentR.value = withDelay(200, withSpring(15, spring));
    studentInR.value = withDelay(350, withSpring(6.5, spring));

    // 300ms — path draws itself
    pathDraw.value = withDelay(
      300,
      withTiming(1, { duration: 900, easing: ease }),
    );

    // 550ms — dot 1 (pink) bursts + sparks fly
    dot1R.value = withDelay(550, withSpring(4, pop));
    spark1.value = withDelay(
      550,
      withTiming(1, { duration: 450, easing: sparkEase }),
    );

    // 750ms — dot 2 (violet) bursts
    dot2R.value = withDelay(750, withSpring(5, pop));
    spark2.value = withDelay(
      750,
      withTiming(1, { duration: 450, easing: sparkEase }),
    );

    // 950ms — dot 3 (mint) bursts
    dot3R.value = withDelay(950, withSpring(6, pop));
    spark3.value = withDelay(
      950,
      withTiming(1, { duration: 450, easing: sparkEase }),
    );

    // 1100ms — mentor node
    mentorR.value = withDelay(1100, withSpring(17, spring));
    mentorInR.value = withDelay(1250, withSpring(7, spring));

    // 1300ms — achievement ring pulses
    ringOp.value = withDelay(
      1300,
      withSequence(
        withTiming(0.35, { duration: 300 }),
        withTiming(0.18, { duration: 400 }),
      ),
    );

    // 1500ms — wordmark fades in
    wordOp.value = withDelay(1500, withTiming(1, { duration: 400 }));

    // 2500ms — fade out and complete
    fade.value = withDelay(
      2500,
      withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(done)();
      }),
    );
    const touchRelease = setTimeout(() => {
      setAcceptsTouches(false);
    }, 2500);
    const completionWatchdog = setTimeout(() => {
      setAcceptsTouches(false);
      done();
    }, 3200);
    return () => {
      clearTimeout(touchRelease);
      clearTimeout(completionWatchdog);
    };
    // The reanimated SharedValues below are listed for the linter; their
    // identity is stable across renders (useSharedValue), so including them
    // does not change the effect's run cadence — it still fires only when
    // `done` or `reduceMotion` flip.
  }, [
    done,
    reduceMotion,
    dot1R,
    dot2R,
    dot3R,
    fade,
    mentorInR,
    mentorR,
    pathDraw,
    ringOp,
    spark1,
    spark2,
    spark3,
    studentInR,
    studentR,
    wordOp,
  ]);

  // --- Animated props for SVG elements ---
  // Android SVG fix (attempt 4): Android's native SVG renderer discards circles
  // created with r=0 AND deprioritizes rendering updates for elements with
  // opacity=0. Previous fixes addressed r=0 with R_FLOOR but re-introduced the
  // problem by holding opacity at exactly 0 (OP_THRESH gate). Fix: NEITHER r
  // NOR opacity may ever be exactly 0. Use sub-perceptual floors for both so
  // the element is always "alive" in the native render tree.
  const R_FLOOR = 0.1; // sub-pixel radius — bigger than 0.01 for Android safety
  const OP_FLOOR = 0.001; // imperceptible opacity — keeps element in render pipeline

  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LEN * (1 - pathDraw.value),
    opacity: Math.max(OP_FLOOR, Math.min(pathDraw.value * 10, 1)),
  }));

  const studentOutProps = useAnimatedProps(() => ({
    r: Math.max(studentR.value, R_FLOOR),
    opacity: Math.max(OP_FLOOR, Math.min(studentR.value / 2, 1)),
  }));
  const studentInProps = useAnimatedProps(() => ({
    r: Math.max(studentInR.value, R_FLOOR),
    opacity: Math.max(OP_FLOOR, Math.min(studentInR.value, 1)),
  }));
  const mentorOutProps = useAnimatedProps(() => ({
    r: Math.max(mentorR.value, R_FLOOR),
    opacity: Math.max(OP_FLOOR, Math.min(mentorR.value / 2, 1)),
  }));
  const mentorInProps = useAnimatedProps(() => ({
    r: Math.max(mentorInR.value, R_FLOOR),
    opacity: Math.max(OP_FLOOR, Math.min(mentorInR.value, 1)),
  }));
  const ringProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, ringOp.value),
  }));

  const dot1Props = useAnimatedProps(() => ({
    r: Math.max(dot1R.value, R_FLOOR),
    opacity: Math.max(OP_FLOOR, Math.min(dot1R.value / 4, 1) * 0.6),
  }));
  const dot2Props = useAnimatedProps(() => ({
    r: Math.max(dot2R.value, R_FLOOR),
    opacity: Math.max(OP_FLOOR, Math.min(dot2R.value / 5, 1) * 0.65),
  }));
  const dot3Props = useAnimatedProps(() => ({
    r: Math.max(dot3R.value, R_FLOOR),
    opacity: Math.max(OP_FLOOR, Math.min(dot3R.value / 6, 1) * 0.7),
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
      style={[styles.container, { backgroundColor: C.bg }, containerStyle]}
      testID="animated-splash"
      pointerEvents={acceptsTouches ? 'auto' : 'none'}
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
          <Text style={[styles.mentText, { color: C.text }]}>ment</Text>
          <View style={[styles.circleO, { borderColor: C.textViolet }]}>
            <View
              style={[styles.circleODot, { backgroundColor: C.textViolet }]}
            />
          </View>
          <Text style={[styles.mateText, { color: C.textTeal }]}>mate</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
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
    letterSpacing: -0.5,
  },
  circleO: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    marginBottom: 2, // align with text baseline
  },
  circleODot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  mateText: {
    fontFamily: 'AtkinsonHyperlegible_700Bold',
    fontSize: 28,
    letterSpacing: -0.5,
  },
});
