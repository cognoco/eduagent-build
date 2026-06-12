import { useEffect, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Path,
  Circle,
  Ellipse,
  Rect,
  G,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  cancelAnimation,
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
import { MASCOT_COLORS, MASCOT_BADGE } from './mentor-mascot-geometry';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedG = Animated.createAnimatedComponent(G);

// Brand colors — mascot palette + spark tints from the previous logo burst
const C = {
  ...MASCOT_COLORS,
  sparkPink: '#fce7f3',
  sparkViolet: '#ede9fe',
  sparkMint: '#d1fae5',
} as const;

const HEAD = MASCOT_BADGE.head;
const SKIRT = MASCOT_BADGE.skirt;
const DOTS = MASCOT_BADGE.juggleDots;
/** Dots launch from behind the head and spring up to their juggle spots. */
const DOT_LAUNCH_CY = 55;

type BrandCelebrationProps = {
  /** Diameter of the animation area (default 120) */
  size?: number;
  /** Called when the animation completes (~750ms) */
  onComplete?: () => void;
  testID?: string;
};

/**
 * Brand-themed celebration animation — The Mentor mascot.
 *
 * The mentor octopus performs a fast, punchy celebration in the compact
 * badge pose (geometry: mentor-mascot-geometry.ts): the teal dot POPS in →
 * arms spring out → the beanie drops on → eyes blink open → the three
 * milestone dots launch into a juggle with sparks → happy bounce.
 *
 * ~750ms total. Designed to be addictively satisfying.
 */
export function BrandCelebration({
  size = 120,
  onComplete,
  testID,
}: BrandCelebrationProps) {
  const reduceMotion = useReducedMotion();

  // --- Shared values ---
  const bodyR = useSharedValue(0); // head radius (the teal dot popping in)
  const skirtP = useSharedValue(0); // skirt grow progress 0→1
  const armsOp = useSharedValue(0); // arm group opacity
  const beanieP = useSharedValue(0); // beanie drop progress 0→1
  const faceOp = useSharedValue(0); // eyes + smirk group opacity (blink)
  const dot1P = useSharedValue(0); // juggle dot launch progress 0→1
  const dot2P = useSharedValue(0);
  const dot3P = useSharedValue(0);
  const spark1 = useSharedValue(0);
  const spark2 = useSharedValue(0);
  const spark3 = useSharedValue(0);
  const bounce = useSharedValue(1); // whole-mascot happy bounce
  const containerOp = useSharedValue(1);

  const done = useCallback(() => onComplete?.(), [onComplete]);

  const jumpToFinal = useCallback(() => {
    bodyR.value = HEAD.r;
    skirtP.value = 1;
    armsOp.value = 1;
    beanieP.value = 1;
    faceOp.value = 1;
    dot1P.value = 1;
    dot2P.value = 1;
    dot3P.value = 1;
    bounce.value = 1;
    // Sparks stay at 0 — they are transient particles, invisible at rest.
  }, [bodyR, skirtP, armsOp, beanieP, faceOp, dot1P, dot2P, dot3P, bounce]);

  useEffect(() => {
    // Accessibility: skip animation entirely
    if (reduceMotion) {
      containerOp.value = 1;
      jumpToFinal();
      done();
      return;
    }

    // ── FAST, PUNCHY springs ──
    // Lower damping = more overshoot = more satisfying
    const pop = { damping: 4, stiffness: 220 }; // ~40% overshoot
    const slam = { damping: 3, stiffness: 250 }; // ~50% overshoot
    // Easing.out(Easing.cubic) equivalent — avoids jest mock gaps
    const sparkEase = Easing.bezier(0.33, 1, 0.68, 1);

    // 0ms — The teal dot POPS in (the mentor node, becoming a head)
    bodyR.value = withSpring(HEAD.r, slam);
    skirtP.value = withDelay(40, withSpring(1, pop));

    // 120ms — Arms spring out
    armsOp.value = withDelay(
      120,
      withTiming(1, { duration: 120, easing: sparkEase }),
    );

    // 180ms — The beanie drops on (the personality arrives)
    beanieP.value = withDelay(180, withSpring(1, pop));

    // 260ms — Eyes blink open, smirk settles
    faceOp.value = withDelay(
      260,
      withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0.2, { duration: 50 }),
        withTiming(1, { duration: 80 }),
      ),
    );

    // 320/380/440ms — Milestone dots LAUNCH into the juggle, with sparks
    dot1P.value = withDelay(320, withSpring(1, slam));
    spark1.value = withDelay(
      320,
      withTiming(1, { duration: 350, easing: sparkEase }),
    );
    dot2P.value = withDelay(380, withSpring(1, slam));
    spark2.value = withDelay(
      380,
      withTiming(1, { duration: 350, easing: sparkEase }),
    );
    dot3P.value = withDelay(440, withSpring(1, slam));
    spark3.value = withDelay(
      440,
      withTiming(1, { duration: 350, easing: sparkEase }),
    );

    // 520ms — Happy bounce (the whole mascot pulses)
    bounce.value = withDelay(
      520,
      withSequence(
        withTiming(0.92, { duration: 80 }),
        withSpring(1, { damping: 6, stiffness: 300 }),
      ),
    );

    // 750ms — Done
    containerOp.value = withDelay(
      750,
      withTiming(1, { duration: 1 }, (finished) => {
        if (finished) runOnJS(done)();
      }),
    );
    // Reanimated SharedValues have stable identity across renders, so listing
    // them satisfies the linter without changing when this effect actually
    // re-runs (still only on `done` / `reduceMotion` changes).
  }, [
    done,
    reduceMotion,
    jumpToFinal,
    containerOp,
    bodyR,
    skirtP,
    armsOp,
    beanieP,
    faceOp,
    dot1P,
    dot2P,
    dot3P,
    spark1,
    spark2,
    spark3,
    bounce,
  ]);

  // Fabric safety net: if animated prop updates didn't fire after 500ms
  // (cold start, JS thread busy, Fabric native module init delay), jump to
  // final static state so the celebration is always visible. 500ms is generous
  // enough to avoid false positives on slow devices while still well within
  // the 750ms animation window.
  useEffect(() => {
    if (reduceMotion) return;
    const fallback = setTimeout(() => {
      if (bodyR.value < 0.1) {
        jumpToFinal();
      }
    }, 500);
    return () => clearTimeout(fallback);
  }, [reduceMotion, bodyR, jumpToFinal]);

  // Cancel all in-flight animations on unmount to prevent warnings and memory leaks.
  useEffect(() => {
    return () => {
      cancelAnimation(bodyR);
      cancelAnimation(skirtP);
      cancelAnimation(armsOp);
      cancelAnimation(beanieP);
      cancelAnimation(faceOp);
      cancelAnimation(dot1P);
      cancelAnimation(dot2P);
      cancelAnimation(dot3P);
      cancelAnimation(spark1);
      cancelAnimation(spark2);
      cancelAnimation(spark3);
      cancelAnimation(bounce);
      cancelAnimation(containerOp);
    };
  }, [
    bodyR,
    skirtP,
    armsOp,
    beanieP,
    faceOp,
    dot1P,
    dot2P,
    dot3P,
    spark1,
    spark2,
    spark3,
    bounce,
    containerOp,
  ]);

  // --- Animated props ---
  // Android SVG fix: Android's native SVG renderer permanently discards circles
  // created with r=0. Ensure r is never zero via Math.max with a sub-pixel floor,
  // and hold opacity at 0 until the animation begins moving.
  const R_FLOOR = 0.01;
  const OP_THRESH = 0.1;

  const headProps = useAnimatedProps(() => ({
    r: Math.max(bodyR.value, R_FLOOR),
    opacity: bodyR.value < OP_THRESH ? 0 : Math.min(bodyR.value / 4, 1),
  }));
  const skirtProps = useAnimatedProps(() => ({
    rx: Math.max(SKIRT.rx * skirtP.value, R_FLOOR),
    ry: Math.max(SKIRT.ry * skirtP.value, R_FLOOR),
    opacity: skirtP.value < OP_THRESH ? 0 : Math.min(skirtP.value * 2, 1),
  }));
  const armsProps = useAnimatedProps(() => ({ opacity: armsOp.value }));
  const beanieProps = useAnimatedProps(() => {
    const p = beanieP.value;
    return {
      // Drops in from above; spring overshoot squashes it slightly past rest.
      y: -34 * (1 - p),
      opacity: p < OP_THRESH ? 0 : Math.min(p * 3, 1),
    };
  });
  const faceProps = useAnimatedProps(() => ({ opacity: faceOp.value }));

  const dot1Props = useAnimatedProps(() => {
    const t = dot1P.value;
    return {
      cy: DOT_LAUNCH_CY - (DOT_LAUNCH_CY - DOTS[0].cy) * t,
      r: Math.max(DOTS[0].r * Math.min(t * 2, 1), R_FLOOR),
      opacity: t < OP_THRESH ? 0 : Math.min(t * 2, 1),
    };
  });
  const dot2Props = useAnimatedProps(() => {
    const t = dot2P.value;
    return {
      cy: DOT_LAUNCH_CY - (DOT_LAUNCH_CY - DOTS[1].cy) * t,
      r: Math.max(DOTS[1].r * Math.min(t * 2, 1), R_FLOOR),
      opacity: t < OP_THRESH ? 0 : Math.min(t * 2, 1),
    };
  });
  const dot3Props = useAnimatedProps(() => {
    const t = dot3P.value;
    return {
      cy: DOT_LAUNCH_CY - (DOT_LAUNCH_CY - DOTS[2].cy) * t,
      r: Math.max(DOTS[2].r * Math.min(t * 2, 1), R_FLOOR),
      opacity: t < OP_THRESH ? 0 : Math.min(t * 2, 1),
    };
  });

  // --- Spark particles (2 per dot, varied directions) ---
  const s1a = useAnimatedProps(() => {
    const t = spark1.value;
    return {
      cx: DOTS[0].cx - 12 * t,
      cy: DOTS[0].cy - 10 * t,
      r: 2.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s1b = useAnimatedProps(() => {
    const t = spark1.value;
    return {
      cx: DOTS[0].cx + 10 * t,
      cy: DOTS[0].cy - 13 * t,
      r: 2 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s2a = useAnimatedProps(() => {
    const t = spark2.value;
    return {
      cx: DOTS[1].cx - 11 * t,
      cy: DOTS[1].cy - 12 * t,
      r: 2.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s2b = useAnimatedProps(() => {
    const t = spark2.value;
    return {
      cx: DOTS[1].cx + 13 * t,
      cy: DOTS[1].cy - 9 * t,
      r: 2 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s3a = useAnimatedProps(() => {
    const t = spark3.value;
    return {
      cx: DOTS[2].cx + 12 * t,
      cy: DOTS[2].cy - 11 * t,
      r: 2.5 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });
  const s3b = useAnimatedProps(() => {
    const t = spark3.value;
    return {
      cx: DOTS[2].cx - 9 * t,
      cy: DOTS[2].cy + 12 * t,
      r: 2 * (1 - t * 0.6),
      opacity: 1 - t,
    };
  });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOp.value,
    transform: [{ scale: bounce.value }],
  }));

  const g = MASCOT_BADGE;

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox={g.viewBox}>
        <Defs>
          <LinearGradient
            id="cel-mascot-body"
            x1="0"
            y1={g.gradient.y1}
            x2="0"
            y2={g.gradient.y2}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor={C.tealBright} />
            <Stop offset="100%" stopColor={C.tealDeep} />
          </LinearGradient>
        </Defs>

        {/* Spark particles (behind everything) */}
        <AnimatedCircle fill={C.sparkPink} animatedProps={s1a} />
        <AnimatedCircle fill={C.sparkPink} animatedProps={s1b} />
        <AnimatedCircle fill={C.sparkViolet} animatedProps={s2a} />
        <AnimatedCircle fill={C.sparkViolet} animatedProps={s2b} />
        <AnimatedCircle fill={C.sparkMint} animatedProps={s3a} />
        <AnimatedCircle fill={C.sparkMint} animatedProps={s3b} />

        {/* Milestone dots — LAUNCH into the juggle */}
        <AnimatedCircle
          cx={DOTS[0].cx}
          fill={DOTS[0].fill}
          animatedProps={dot1Props}
        />
        <AnimatedCircle
          cx={DOTS[1].cx}
          fill={DOTS[1].fill}
          animatedProps={dot2Props}
        />
        <AnimatedCircle
          cx={DOTS[2].cx}
          fill={DOTS[2].fill}
          animatedProps={dot3Props}
        />

        {/* Arms spring out (under the body) */}
        <AnimatedG animatedProps={armsProps}>
          {g.arms.map((arm) => (
            <Path key={arm.d} d={arm.d} fill={arm.fill} />
          ))}
        </AnimatedG>

        {/* Body: the teal dot pops into a head; skirt grows under it */}
        <AnimatedCircle
          cx={HEAD.cx}
          cy={HEAD.cy}
          fill="url(#cel-mascot-body)"
          animatedProps={headProps}
        />
        <AnimatedEllipse
          cx={SKIRT.cx}
          cy={SKIRT.cy}
          fill="url(#cel-mascot-body)"
          animatedProps={skirtProps}
        />

        {/* The beanie drops on */}
        <AnimatedG animatedProps={beanieProps}>
          <Path d={g.beanie.dome} fill={C.beanie} />
          <Rect
            x={g.beanie.band.x}
            y={g.beanie.band.y}
            width={g.beanie.band.width}
            height={g.beanie.band.height}
            rx={g.beanie.band.rx}
            fill={C.beanieBand}
          />
        </AnimatedG>

        {/* Face blinks open */}
        <AnimatedG animatedProps={faceProps}>
          <Circle
            cx={g.eyes.left.cx}
            cy={g.eyes.cy}
            r={g.eyes.r}
            fill={C.white}
          />
          <Circle
            cx={g.eyes.left.cx}
            cy={g.eyes.pupilCy}
            r={g.eyes.pupilR}
            fill={C.navy}
          />
          <Path d={g.eyes.left.lid} fill="url(#cel-mascot-body)" />
          <Path
            d={g.eyes.left.crease}
            stroke={C.crease}
            strokeWidth={g.eyes.creaseWidth}
            strokeLinecap="round"
          />
          <Circle
            cx={g.eyes.right.cx}
            cy={g.eyes.cy}
            r={g.eyes.r}
            fill={C.white}
          />
          <Circle
            cx={g.eyes.right.cx}
            cy={g.eyes.pupilCy}
            r={g.eyes.pupilR}
            fill={C.navy}
          />
          <Path d={g.eyes.right.lid} fill="url(#cel-mascot-body)" />
          <Path
            d={g.eyes.right.crease}
            stroke={C.crease}
            strokeWidth={g.eyes.creaseWidth}
            strokeLinecap="round"
          />
          <Path
            d={g.smirk.d}
            fill="none"
            stroke={C.navy}
            strokeWidth={g.smirk.width}
            strokeLinecap="round"
          />
        </AnimatedG>
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
