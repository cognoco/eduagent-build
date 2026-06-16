import type { ComponentType } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MASCOT_COLORS, MASCOT_HERO } from './mentor-mascot-geometry';

let AnimatedCircle: ComponentType<Record<string, unknown>>;
let AnimatedEllipse: ComponentType<Record<string, unknown>>;
let AnimatedG: ComponentType<Record<string, unknown>>;
let AnimatedPath: ComponentType<Record<string, unknown>>;
let _birthAnimationAvailable = true;

try {
  AnimatedCircle = Animated.createAnimatedComponent(Circle);
  AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
  AnimatedG = Animated.createAnimatedComponent(G);
  AnimatedPath = Animated.createAnimatedComponent(Path);
} catch (e) {
  _birthAnimationAvailable = false;
  AnimatedCircle = Circle as never;
  AnimatedEllipse = Ellipse as never;
  AnimatedG = G as never;
  AnimatedPath = Path as never;
  console.error('[MentorBirthAnimation] createAnimatedComponent failed:', e);
}

type MentorBirthAnimationProps = {
  readyLabel: string;
  onComplete?: () => void;
  size?: number;
  testID?: string;
};

const LOGO_PATH = 'M26,166 C26,96 156,92 184,28';
const LOGO_PATH_LEN = 190;
const VIEWBOX = '-12 -18 254 224';
const R_FLOOR = 0.1;
const OP_FLOOR = 0.001;

const LOGO_DOTS = [
  {
    start: { cx: 70, cy: 118 },
    final: { cx: 58, cy: 28 },
    r: 7,
    fill: MASCOT_COLORS.dotPink,
  },
  {
    start: { cx: 112, cy: 90 },
    final: { cx: 110, cy: 10 },
    r: 8,
    fill: MASCOT_COLORS.dotViolet,
  },
  {
    start: { cx: 150, cy: 60 },
    final: { cx: 162, cy: 26 },
    r: 9,
    fill: MASCOT_COLORS.dotMint,
  },
] as const;

const HERO = MASCOT_HERO;
const C = MASCOT_COLORS;

function lerp(from: number, to: number, t: number) {
  'worklet';
  return from + (to - from) * t;
}

/**
 * Mentor birth ceremony.
 *
 * Brand-fixed animation: logo path draws, the milestone dots gather around
 * the teal mentor node, the node morphs into the hero-pose mascot, and the
 * ready copy hands off to the first learning session.
 */
export function MentorBirthAnimation({
  readyLabel,
  onComplete,
  size = 260,
  testID = 'mentor-birth-animation',
}: MentorBirthAnimationProps) {
  const reduceMotion = useReducedMotion();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [acceptsTouches, setAcceptsTouches] = useState(true);
  const [hasExited, setHasExited] = useState(false);

  const onCompleteRef = useRef(onComplete);
  const completionDeliveredRef = useRef(false);
  const mountedRef = useRef(true);
  onCompleteRef.current = onComplete;

  const pathDraw = useSharedValue(0);
  const pathDust = useSharedValue(0);
  const studentR = useSharedValue(0);
  const studentOp = useSharedValue(1);
  const mentorNodeR = useSharedValue(0);
  const mentorNodeWobble = useSharedValue(1);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  const orbit = useSharedValue(0);
  const bodyR = useSharedValue(0);
  const skirtP = useSharedValue(0);
  const armsOp = useSharedValue(0);
  const suckersOp = useSharedValue(0);
  const faceOp = useSharedValue(0);
  const beanieP = useSharedValue(0);
  const catchP = useSharedValue(0);
  const copyOp = useSharedValue(0);
  const fade = useSharedValue(1);

  const done = useCallback(() => {
    if (completionDeliveredRef.current) return;
    completionDeliveredRef.current = true;
    if (mountedRef.current) {
      setAcceptsTouches(false);
      setHasExited(true);
    }
    onCompleteRef.current?.();
  }, []);

  const jumpToFinal = useCallback(() => {
    pathDraw.value = 1;
    pathDust.value = 1;
    studentR.value = 13;
    studentOp.value = 0.2;
    mentorNodeR.value = 0.1;
    mentorNodeWobble.value = 1;
    dot1.value = 1;
    dot2.value = 1;
    dot3.value = 1;
    orbit.value = 1;
    bodyR.value = HERO.head.r;
    skirtP.value = 1;
    armsOp.value = 1;
    suckersOp.value = 1;
    faceOp.value = 1;
    beanieP.value = 1;
    catchP.value = 1;
    copyOp.value = 1;
    fade.value = 1;
  }, [
    pathDraw,
    pathDust,
    studentR,
    studentOp,
    mentorNodeR,
    mentorNodeWobble,
    dot1,
    dot2,
    dot3,
    orbit,
    bodyR,
    skirtP,
    armsOp,
    suckersOp,
    faceOp,
    beanieP,
    catchP,
    copyOp,
    fade,
  ]);

  const skip = useCallback(() => {
    setAcceptsTouches(false);
    jumpToFinal();
    fade.value = 0;
    done();
  }, [done, fade, jumpToFinal]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!_birthAnimationAvailable) {
      jumpToFinal();
      done();
      return;
    }

    if (reduceMotion) {
      setAcceptsTouches(false);
      jumpToFinal();
      done();
      return;
    }

    const ease = Easing.bezier(0.25, 0.1, 0.25, 1);
    const sparkEase = Easing.bezier(0.33, 1, 0.68, 1);
    const spring = { damping: 8, stiffness: 160 };
    const pop = { damping: 5, stiffness: 190 };

    pathDraw.value = withDelay(
      120,
      withTiming(1, { duration: 900, easing: ease }),
    );
    studentR.value = withDelay(220, withSpring(15, spring));
    mentorNodeR.value = withDelay(920, withSpring(18, spring));

    pathDust.value = withDelay(
      1350,
      withTiming(1, { duration: 420, easing: sparkEase }),
    );
    studentOp.value = withDelay(1450, withTiming(0.2, { duration: 360 }));

    dot1.value = withDelay(1560, withSpring(0.55, pop));
    dot2.value = withDelay(1660, withSpring(0.55, pop));
    dot3.value = withDelay(1760, withSpring(0.55, pop));
    orbit.value = withDelay(1880, withTiming(1, { duration: 760 }));

    mentorNodeWobble.value = withDelay(
      2040,
      withSequence(
        withTiming(1.12, { duration: 140 }),
        withTiming(0.94, { duration: 120 }),
        withSpring(1, pop),
      ),
    );
    bodyR.value = withDelay(2380, withSpring(HERO.head.r, pop));
    skirtP.value = withDelay(2480, withSpring(1, pop));
    armsOp.value = withDelay(2680, withTiming(1, { duration: 480 }));
    suckersOp.value = withDelay(3100, withTiming(1, { duration: 280 }));
    faceOp.value = withDelay(
      3360,
      withSequence(
        withTiming(1, { duration: 70 }),
        withTiming(0.1, { duration: 80 }),
        withTiming(1, { duration: 130 }),
      ),
    );
    beanieP.value = withDelay(3620, withSpring(1, pop));
    catchP.value = withDelay(3900, withSpring(1, pop));
    copyOp.value = withDelay(4200, withTiming(1, { duration: 260 }));
    fade.value = withDelay(
      4720,
      withTiming(1, { duration: 1 }, (finished) => {
        if (finished) runOnJS(done)();
      }),
    );

    const touchRelease = setTimeout(() => setAcceptsTouches(false), 4200);
    const completionWatchdog = setTimeout(() => done(), 5400);

    return () => {
      clearTimeout(touchRelease);
      clearTimeout(completionWatchdog);
    };
  }, [
    reduceMotion,
    done,
    jumpToFinal,
    pathDraw,
    pathDust,
    studentR,
    studentOp,
    mentorNodeR,
    mentorNodeWobble,
    dot1,
    dot2,
    dot3,
    orbit,
    bodyR,
    skirtP,
    armsOp,
    suckersOp,
    faceOp,
    beanieP,
    catchP,
    copyOp,
    fade,
  ]);

  useEffect(() => {
    if (reduceMotion) return;
    const fallback = setTimeout(() => {
      if (pathDraw.value < 0.01 && bodyR.value < 0.01) {
        jumpToFinal();
      }
    }, 500);
    return () => clearTimeout(fallback);
  }, [bodyR, jumpToFinal, pathDraw, reduceMotion]);

  useEffect(() => {
    return () => {
      cancelAnimation(pathDraw);
      cancelAnimation(pathDust);
      cancelAnimation(studentR);
      cancelAnimation(studentOp);
      cancelAnimation(mentorNodeR);
      cancelAnimation(mentorNodeWobble);
      cancelAnimation(dot1);
      cancelAnimation(dot2);
      cancelAnimation(dot3);
      cancelAnimation(orbit);
      cancelAnimation(bodyR);
      cancelAnimation(skirtP);
      cancelAnimation(armsOp);
      cancelAnimation(suckersOp);
      cancelAnimation(faceOp);
      cancelAnimation(beanieP);
      cancelAnimation(catchP);
      cancelAnimation(copyOp);
      cancelAnimation(fade);
    };
  }, [
    pathDraw,
    pathDust,
    studentR,
    studentOp,
    mentorNodeR,
    mentorNodeWobble,
    dot1,
    dot2,
    dot3,
    orbit,
    bodyR,
    skirtP,
    armsOp,
    suckersOp,
    faceOp,
    beanieP,
    catchP,
    copyOp,
    fade,
  ]);

  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: LOGO_PATH_LEN * (1 - pathDraw.value),
    opacity: Math.max(OP_FLOOR, 1 - pathDust.value),
  }));

  const dustProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, pathDust.value * (1 - pathDust.value) * 4),
  }));

  const studentProps = useAnimatedProps(() => ({
    r: Math.max(R_FLOOR, studentR.value),
    opacity: Math.max(OP_FLOOR, studentOp.value),
  }));

  const mentorNodeProps = useAnimatedProps(() => ({
    r: Math.max(R_FLOOR, mentorNodeR.value * mentorNodeWobble.value),
    opacity: Math.max(OP_FLOOR, 1 - Math.min(bodyR.value / 8, 1)),
  }));

  const headProps = useAnimatedProps(() => ({
    r: Math.max(R_FLOOR, bodyR.value),
    opacity: Math.max(OP_FLOOR, Math.min(bodyR.value / 8, 1)),
  }));

  const skirtProps = useAnimatedProps(() => ({
    rx: Math.max(R_FLOOR, HERO.skirt.rx * skirtP.value),
    ry: Math.max(R_FLOOR, HERO.skirt.ry * skirtP.value),
    opacity: Math.max(OP_FLOOR, Math.min(skirtP.value * 2, 1)),
  }));

  const armsProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, armsOp.value),
  }));

  const suckersProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, suckersOp.value),
  }));

  const faceProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, faceOp.value),
  }));

  const beanieProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, beanieP.value),
    y: -34 * (1 - beanieP.value),
  }));

  const mascotProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, Math.min((bodyR.value / HERO.head.r) * 1.4, 1)),
  }));

  const dot1Props = useAnimatedProps(() => {
    const gather = Math.min(dot1.value / 0.55, 1);
    const catchAmount = catchP.value;
    const angle = -2.6 + orbit.value * 7.1;
    const orbitCx = HERO.head.cx + Math.cos(angle) * 64;
    const orbitCy = HERO.head.cy + Math.sin(angle) * 34;
    return {
      cx: lerp(
        lerp(LOGO_DOTS[0].start.cx, orbitCx, gather),
        LOGO_DOTS[0].final.cx,
        catchAmount,
      ),
      cy: lerp(
        lerp(LOGO_DOTS[0].start.cy, orbitCy, gather),
        LOGO_DOTS[0].final.cy,
        catchAmount,
      ),
      r: Math.max(R_FLOOR, LOGO_DOTS[0].r * Math.min(dot1.value * 1.8, 1)),
      opacity: Math.max(OP_FLOOR, Math.min(dot1.value * 2, 1)),
    };
  });

  const dot2Props = useAnimatedProps(() => {
    const gather = Math.min(dot2.value / 0.55, 1);
    const catchAmount = catchP.value;
    const angle = -1.5 + orbit.value * 7.6;
    const orbitCx = HERO.head.cx + Math.cos(angle) * 54;
    const orbitCy = HERO.head.cy + Math.sin(angle) * 42;
    return {
      cx: lerp(
        lerp(LOGO_DOTS[1].start.cx, orbitCx, gather),
        LOGO_DOTS[1].final.cx,
        catchAmount,
      ),
      cy: lerp(
        lerp(LOGO_DOTS[1].start.cy, orbitCy, gather),
        LOGO_DOTS[1].final.cy,
        catchAmount,
      ),
      r: Math.max(R_FLOOR, LOGO_DOTS[1].r * Math.min(dot2.value * 1.8, 1)),
      opacity: Math.max(OP_FLOOR, Math.min(dot2.value * 2, 1)),
    };
  });

  const dot3Props = useAnimatedProps(() => {
    const gather = Math.min(dot3.value / 0.55, 1);
    const catchAmount = catchP.value;
    const angle = -0.35 + orbit.value * 8.2;
    const orbitCx = HERO.head.cx + Math.cos(angle) * 62;
    const orbitCy = HERO.head.cy + Math.sin(angle) * 36;
    return {
      cx: lerp(
        lerp(LOGO_DOTS[2].start.cx, orbitCx, gather),
        LOGO_DOTS[2].final.cx,
        catchAmount,
      ),
      cy: lerp(
        lerp(LOGO_DOTS[2].start.cy, orbitCy, gather),
        LOGO_DOTS[2].final.cy,
        catchAmount,
      ),
      r: Math.max(R_FLOOR, LOGO_DOTS[2].r * Math.min(dot3.value * 1.8, 1)),
      opacity: Math.max(OP_FLOOR, Math.min(dot3.value * 2, 1)),
    };
  });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyOp.value,
    transform: [{ translateY: 8 * (1 - copyOp.value) }],
  }));

  if (hasExited) return null;

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      testID={testID}
      pointerEvents={acceptsTouches ? 'auto' : 'none'}
    >
      <Pressable
        onPress={skip}
        disabled={!acceptsTouches}
        style={styles.pressable}
        testID="mentor-birth-animation-skip"
        accessibilityRole="button"
        accessibilityLabel={readyLabel}
      >
        <View style={styles.stage}>
          <Svg width={size} height={Math.round(size * 0.83)} viewBox={VIEWBOX}>
            <Defs>
              <LinearGradient
                id="mentor-birth-path"
                x1="0"
                y1="1"
                x2="1"
                y2="0"
              >
                <Stop offset="0%" stopColor={C.beanieBand} />
                <Stop offset="100%" stopColor={C.dotMint} />
              </LinearGradient>
              <LinearGradient
                id="mentor-birth-body"
                x1="0"
                y1={HERO.gradient.y1}
                x2="0"
                y2={HERO.gradient.y2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0%" stopColor={C.tealBright} />
                <Stop offset="100%" stopColor={C.tealDeep} />
              </LinearGradient>
            </Defs>

            <AnimatedPath
              d={LOGO_PATH}
              fill="none"
              stroke="url(#mentor-birth-path)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${LOGO_PATH_LEN}`}
              animatedProps={pathProps}
              testID="mentor-birth-logo-path"
            />
            <AnimatedG animatedProps={dustProps}>
              <Circle cx={78} cy={114} r={2.4} fill={C.dotPink} />
              <Circle cx={106} cy={92} r={1.8} fill={C.beanieBand} />
              <Circle cx={138} cy={70} r={2.2} fill={C.dotMint} />
              <Circle cx={170} cy={42} r={1.7} fill={C.mint} />
            </AnimatedG>

            <AnimatedCircle
              cx={26}
              cy={166}
              fill={C.beanie}
              animatedProps={studentProps}
            />
            <AnimatedCircle
              cx={HERO.head.cx}
              cy={HERO.head.cy}
              fill={C.tealBright}
              animatedProps={mentorNodeProps}
              testID="mentor-birth-mentor-node"
            />

            <AnimatedCircle
              fill={LOGO_DOTS[0].fill}
              animatedProps={dot1Props}
            />
            <AnimatedCircle
              fill={LOGO_DOTS[1].fill}
              animatedProps={dot2Props}
            />
            <AnimatedCircle
              fill={LOGO_DOTS[2].fill}
              animatedProps={dot3Props}
            />

            <AnimatedG animatedProps={mascotProps} testID="mentor-birth-mascot">
              <AnimatedG animatedProps={armsProps}>
                {HERO.arms.map((arm) => (
                  <Path key={arm.d} d={arm.d} fill={arm.fill} />
                ))}
              </AnimatedG>

              <AnimatedCircle
                cx={HERO.head.cx}
                cy={HERO.head.cy}
                fill="url(#mentor-birth-body)"
                animatedProps={headProps}
              />
              <AnimatedEllipse
                cx={HERO.skirt.cx}
                cy={HERO.skirt.cy}
                fill="url(#mentor-birth-body)"
                animatedProps={skirtProps}
              />

              <AnimatedG animatedProps={suckersProps}>
                {HERO.suckers.map((sucker) => (
                  <Ellipse
                    key={`${sucker.cx}-${sucker.cy}`}
                    cx={sucker.cx}
                    cy={sucker.cy}
                    rx={sucker.rx}
                    ry={sucker.ry}
                    fill={C.mint}
                  />
                ))}
              </AnimatedG>

              <AnimatedG animatedProps={beanieProps}>
                <Path d={HERO.beanie.dome} fill={C.beanie} />
                <Rect
                  x={HERO.beanie.band.x}
                  y={HERO.beanie.band.y}
                  width={HERO.beanie.band.width}
                  height={HERO.beanie.band.height}
                  rx={HERO.beanie.band.rx}
                  fill={C.beanieBand}
                />
              </AnimatedG>

              <AnimatedG animatedProps={faceProps}>
                <Circle
                  cx={HERO.eyes.left.cx}
                  cy={HERO.eyes.cy}
                  r={HERO.eyes.r}
                  fill={C.white}
                />
                <Circle
                  cx={HERO.eyes.left.cx}
                  cy={HERO.eyes.pupilCy}
                  r={HERO.eyes.pupilR}
                  fill={C.navy}
                />
                <Path d={HERO.eyes.left.lid} fill="url(#mentor-birth-body)" />
                <Path
                  d={HERO.eyes.left.crease}
                  stroke={C.crease}
                  strokeWidth={HERO.eyes.creaseWidth}
                  strokeLinecap="round"
                />
                <Circle
                  cx={HERO.eyes.right.cx}
                  cy={HERO.eyes.cy}
                  r={HERO.eyes.r}
                  fill={C.white}
                />
                <Circle
                  cx={HERO.eyes.right.cx}
                  cy={HERO.eyes.pupilCy}
                  r={HERO.eyes.pupilR}
                  fill={C.navy}
                />
                <Path d={HERO.eyes.right.lid} fill="url(#mentor-birth-body)" />
                <Path
                  d={HERO.eyes.right.crease}
                  stroke={C.crease}
                  strokeWidth={HERO.eyes.creaseWidth}
                  strokeLinecap="round"
                />
                <Path
                  d={HERO.smirk.d}
                  fill="none"
                  stroke={C.navy}
                  strokeWidth={HERO.smirk.width}
                  strokeLinecap="round"
                />
              </AnimatedG>
            </AnimatedG>
          </Svg>
        </View>

        <Animated.Text
          style={[
            styles.readyText,
            { color: isDark ? C.cream : C.navy },
            copyStyle,
          ]}
          testID="mentor-birth-ready-copy"
        >
          {readyLabel}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyText: {
    fontFamily: 'AtkinsonHyperlegible_700Bold',
    fontSize: 20,
    lineHeight: 26,
    marginTop: 6,
    textAlign: 'center',
  },
});
