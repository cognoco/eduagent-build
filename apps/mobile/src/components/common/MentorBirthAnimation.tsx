import type { ComponentType } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
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
import { MASCOT_COLORS } from './mentor-mascot-geometry';
import {
  OCTO_MATE_BIRTH_CENTER,
  OCTO_MATE_BIRTH_TRANSFORM,
  OCTO_MATE_PATHS,
  OCTO_MATE_REPAIR_PATHS,
} from './octo-mate-paths';

let AnimatedCircle: ComponentType<Record<string, unknown>>;
let AnimatedG: ComponentType<Record<string, unknown>>;
let AnimatedPath: ComponentType<Record<string, unknown>>;
let _birthAnimationAvailable = true;

try {
  AnimatedCircle = Animated.createAnimatedComponent(Circle);
  AnimatedG = Animated.createAnimatedComponent(G);
  AnimatedPath = Animated.createAnimatedComponent(Path);
} catch (e) {
  _birthAnimationAvailable = false;
  AnimatedCircle = Circle as never;
  AnimatedG = G as never;
  AnimatedPath = Path as never;
  console.error('[MentorBirthAnimation] createAnimatedComponent failed:', e);
}

type MentorBirthAnimationProps = {
  readyLabel: string;
  onComplete?: () => void;
  size?: number;
  testID?: string;
  timeScale?: number;
};

const LOGO_PATH = 'M26,166 C26,96 156,92 184,28';
const LOGO_PATH_LEN = 190;
const LOGO_MENTOR_NODE = { cx: 184, cy: 28 } as const;
const VIEWBOX = '-12 -18 254 224';
const R_FLOOR = 0.1;
const OP_FLOOR = 0.001;

export const MENTOR_BIRTH_TIMINGS = {
  timeScale: 1.2,
  pokeStart: 4540,
  pokeDrawDuration: 260,
  pokeRetractDuration: 420,
  bounceStart: 4880,
  bounceDuration: 1100,
  copyStart: 4320,
  fadeDelay: 6400,
  touchReleaseDelay: 4200,
  completionDelay: 7100,
} as const;

export const MENTOR_BIRTH_POKE_TENTACLE_SOURCE_INDICES = [
  532, 536, 543, 602, 624, 1006, 1011,
] as const;

const POKE_TENTACLE_SOURCE_INDEX_SET = new Set<number>(
  MENTOR_BIRTH_POKE_TENTACLE_SOURCE_INDICES,
);
const OCTO_MATE_STATIC_PATHS = OCTO_MATE_PATHS.filter(
  (path) => !POKE_TENTACLE_SOURCE_INDEX_SET.has(path.sourceIndex),
);
const OCTO_MATE_POKE_TENTACLE_PATHS = OCTO_MATE_PATHS.filter((path) =>
  POKE_TENTACLE_SOURCE_INDEX_SET.has(path.sourceIndex),
);

const LOGO_DOTS = [
  {
    start: { cx: 70, cy: 118 },
    final: { cx: 42, cy: 14 },
    r: 13,
    fill: MASCOT_COLORS.dotPink,
  },
  {
    start: { cx: 112, cy: 90 },
    final: { cx: 110, cy: 0 },
    r: 15,
    fill: MASCOT_COLORS.dotViolet,
  },
  {
    start: { cx: 150, cy: 60 },
    final: { cx: 178, cy: 14 },
    r: 14,
    fill: MASCOT_COLORS.dotMint,
  },
] as const;

type BirthDotIndex = 0 | 1 | 2;

const DOT_MOTION: Record<
  BirthDotIndex,
  {
    spec: (typeof LOGO_DOTS)[BirthDotIndex];
    gatherAngle: number;
    gatherTurns: number;
    gatherRx: number;
    gatherRy: number;
  }
> = {
  0: {
    spec: LOGO_DOTS[0],
    gatherAngle: -2.6,
    gatherTurns: 7.1,
    gatherRx: 64,
    gatherRy: 34,
  },
  1: {
    spec: LOGO_DOTS[1],
    gatherAngle: -1.5,
    gatherTurns: 7.6,
    gatherRx: 54,
    gatherRy: 42,
  },
  2: {
    spec: LOGO_DOTS[2],
    gatherAngle: -0.35,
    gatherTurns: 8.2,
    gatherRx: 62,
    gatherRy: 36,
  },
};

const BIRTH_MASCOT = OCTO_MATE_BIRTH_CENTER;
const C = MASCOT_COLORS;

function lerp(from: number, to: number, t: number) {
  'worklet';
  return from + (to - from) * t;
}

function time(ms: number, scale: number) {
  return Math.round(ms * scale);
}

function bounceEnvelope(progress: number) {
  'worklet';
  return Math.sin(Math.min(Math.max(progress, 0), 1) * Math.PI);
}

export function resolveBirthDotPosition(
  index: BirthDotIndex,
  gather: number,
  orbit: number,
  catchAmount: number,
  bounce: number,
  poke: number,
) {
  'worklet';
  const motion = DOT_MOTION[index];
  const { spec } = motion;
  const gatherAngle = motion.gatherAngle + orbit * motion.gatherTurns;
  const gatherCx = BIRTH_MASCOT.cx + Math.cos(gatherAngle) * motion.gatherRx;
  const gatherCy = BIRTH_MASCOT.cy + Math.sin(gatherAngle) * motion.gatherRy;
  const settledCx = lerp(
    lerp(spec.start.cx, gatherCx, gather),
    spec.final.cx,
    catchAmount,
  );
  const settledCy = lerp(
    lerp(spec.start.cy, gatherCy, gather),
    spec.final.cy,
    catchAmount,
  );
  const bounceAmount = index === 2 ? bounceEnvelope(bounce) : 0;
  const bounceSide = index === 2 ? Math.sin(bounce * Math.PI * 2) * 5 : 0;
  const pokeAmount = index === 2 ? poke : 0;

  return {
    cx: settledCx + bounceSide - pokeAmount * 7,
    cy: settledCy - bounceAmount * 24 + pokeAmount * 2,
    rScale: 1 + bounceAmount * 0.05 + pokeAmount * 0.12,
  };
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
  timeScale = MENTOR_BIRTH_TIMINGS.timeScale,
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
  const mentorNodeTravel = useSharedValue(0);
  const mentorNodeWobble = useSharedValue(1);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  const dotGather = useSharedValue(0);
  const orbit = useSharedValue(0);
  const bodyR = useSharedValue(0);
  const armsOp = useSharedValue(0);
  const suckersOp = useSharedValue(0);
  const faceOp = useSharedValue(0);
  const beanieP = useSharedValue(0);
  const catchP = useSharedValue(0);
  const pokeP = useSharedValue(0);
  const bounceP = useSharedValue(0);
  const copyOp = useSharedValue(0);
  const fade = useSharedValue(1);

  const done = useCallback(() => {
    if (completionDeliveredRef.current) return;
    completionDeliveredRef.current = true;
    const shouldDismiss = Boolean(onCompleteRef.current);
    if (mountedRef.current) {
      setAcceptsTouches(false);
      setHasExited(shouldDismiss);
    }
    onCompleteRef.current?.();
  }, []);

  const jumpToFinal = useCallback(() => {
    pathDraw.value = 1;
    pathDust.value = 1;
    studentR.value = 13;
    studentOp.value = 0.2;
    mentorNodeR.value = 0.1;
    mentorNodeTravel.value = 1;
    mentorNodeWobble.value = 1;
    dot1.value = 1;
    dot2.value = 1;
    dot3.value = 1;
    dotGather.value = 1;
    orbit.value = 1;
    bodyR.value = BIRTH_MASCOT.r;
    armsOp.value = 1;
    suckersOp.value = 1;
    faceOp.value = 1;
    beanieP.value = 1;
    catchP.value = 1;
    pokeP.value = 0;
    bounceP.value = 1;
    copyOp.value = 1;
    fade.value = 1;
  }, [
    pathDraw,
    pathDust,
    studentR,
    studentOp,
    mentorNodeR,
    mentorNodeTravel,
    mentorNodeWobble,
    dot1,
    dot2,
    dot3,
    dotGather,
    orbit,
    bodyR,
    armsOp,
    suckersOp,
    faceOp,
    beanieP,
    catchP,
    pokeP,
    bounceP,
    copyOp,
    fade,
  ]);

  const skip = useCallback(() => {
    setAcceptsTouches(false);
    jumpToFinal();
    fade.value = onCompleteRef.current ? 0 : 1;
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
      time(120, timeScale),
      withTiming(1, { duration: time(900, timeScale), easing: ease }),
    );
    studentR.value = withDelay(time(220, timeScale), withSpring(15, spring));
    mentorNodeR.value = withDelay(time(920, timeScale), withSpring(18, spring));

    pathDust.value = withDelay(
      time(1780, timeScale),
      withTiming(1, { duration: time(420, timeScale), easing: sparkEase }),
    );
    studentOp.value = withDelay(
      time(1880, timeScale),
      withTiming(0.2, { duration: time(360, timeScale) }),
    );

    dot1.value = withDelay(time(1120, timeScale), withSpring(1, pop));
    dot2.value = withDelay(time(1220, timeScale), withSpring(1, pop));
    dot3.value = withDelay(time(1320, timeScale), withSpring(1, pop));
    dotGather.value = withDelay(
      time(1840, timeScale),
      withTiming(1, { duration: time(620, timeScale) }),
    );
    orbit.value = withDelay(
      time(1960, timeScale),
      withTiming(1, { duration: time(760, timeScale) }),
    );
    mentorNodeTravel.value = withDelay(
      time(1840, timeScale),
      withTiming(1, { duration: time(560, timeScale), easing: ease }),
    );

    mentorNodeWobble.value = withDelay(
      time(2260, timeScale),
      withSequence(
        withTiming(1.12, { duration: time(140, timeScale) }),
        withTiming(0.94, { duration: time(120, timeScale) }),
        withSpring(1, pop),
      ),
    );
    bodyR.value = withDelay(
      time(2500, timeScale),
      withSpring(BIRTH_MASCOT.r, pop),
    );
    armsOp.value = withDelay(
      time(2800, timeScale),
      withTiming(1, { duration: time(480, timeScale) }),
    );
    suckersOp.value = withDelay(
      time(3220, timeScale),
      withTiming(1, { duration: time(280, timeScale) }),
    );
    faceOp.value = withDelay(
      time(3480, timeScale),
      withSequence(
        withTiming(1, { duration: time(70, timeScale) }),
        withTiming(0.1, { duration: time(80, timeScale) }),
        withTiming(1, { duration: time(130, timeScale) }),
      ),
    );
    beanieP.value = withDelay(time(3740, timeScale), withSpring(1, pop));
    catchP.value = withDelay(time(4020, timeScale), withSpring(1, pop));
    pokeP.value = withDelay(
      time(MENTOR_BIRTH_TIMINGS.pokeStart, timeScale),
      withSequence(
        withTiming(1, {
          duration: time(MENTOR_BIRTH_TIMINGS.pokeDrawDuration, timeScale),
          easing: sparkEase,
        }),
        withTiming(0, {
          duration: time(MENTOR_BIRTH_TIMINGS.pokeRetractDuration, timeScale),
          easing: ease,
        }),
      ),
    );
    bounceP.value = withDelay(
      time(MENTOR_BIRTH_TIMINGS.bounceStart, timeScale),
      withTiming(1, {
        duration: time(MENTOR_BIRTH_TIMINGS.bounceDuration, timeScale),
        easing: ease,
      }),
    );
    copyOp.value = withDelay(
      time(MENTOR_BIRTH_TIMINGS.copyStart, timeScale),
      withTiming(1, { duration: time(260, timeScale) }),
    );
    fade.value = withDelay(
      time(MENTOR_BIRTH_TIMINGS.fadeDelay, timeScale),
      withTiming(1, { duration: time(1, timeScale) }, (finished) => {
        if (finished) runOnJS(done)();
      }),
    );

    const touchRelease = setTimeout(
      () => setAcceptsTouches(false),
      time(MENTOR_BIRTH_TIMINGS.touchReleaseDelay, timeScale),
    );
    const completionWatchdog = setTimeout(
      () => done(),
      time(MENTOR_BIRTH_TIMINGS.completionDelay, timeScale),
    );

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
    mentorNodeTravel,
    mentorNodeWobble,
    dot1,
    dot2,
    dot3,
    dotGather,
    orbit,
    bodyR,
    armsOp,
    suckersOp,
    faceOp,
    beanieP,
    catchP,
    pokeP,
    bounceP,
    copyOp,
    fade,
    timeScale,
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
      cancelAnimation(mentorNodeTravel);
      cancelAnimation(mentorNodeWobble);
      cancelAnimation(dot1);
      cancelAnimation(dot2);
      cancelAnimation(dot3);
      cancelAnimation(dotGather);
      cancelAnimation(orbit);
      cancelAnimation(bodyR);
      cancelAnimation(armsOp);
      cancelAnimation(suckersOp);
      cancelAnimation(faceOp);
      cancelAnimation(beanieP);
      cancelAnimation(catchP);
      cancelAnimation(pokeP);
      cancelAnimation(bounceP);
      cancelAnimation(copyOp);
      cancelAnimation(fade);
    };
  }, [
    pathDraw,
    pathDust,
    studentR,
    studentOp,
    mentorNodeR,
    mentorNodeTravel,
    mentorNodeWobble,
    dot1,
    dot2,
    dot3,
    dotGather,
    orbit,
    bodyR,
    armsOp,
    suckersOp,
    faceOp,
    beanieP,
    catchP,
    pokeP,
    bounceP,
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
    cx: lerp(LOGO_MENTOR_NODE.cx, BIRTH_MASCOT.cx, mentorNodeTravel.value),
    cy: lerp(LOGO_MENTOR_NODE.cy, BIRTH_MASCOT.cy, mentorNodeTravel.value),
    r: Math.max(R_FLOOR, mentorNodeR.value * mentorNodeWobble.value),
    opacity: Math.max(OP_FLOOR, 1 - Math.min(bodyR.value / 8, 1)),
  }));

  const mentorNodeCoreProps = useAnimatedProps(() => ({
    cx: lerp(LOGO_MENTOR_NODE.cx, BIRTH_MASCOT.cx, mentorNodeTravel.value),
    cy: lerp(LOGO_MENTOR_NODE.cy, BIRTH_MASCOT.cy, mentorNodeTravel.value),
    r: Math.max(R_FLOOR, mentorNodeR.value * mentorNodeWobble.value * 0.4),
    opacity: Math.max(OP_FLOOR, 1 - Math.min(bodyR.value / 8, 1)),
  }));

  const bodyPathProps = useAnimatedProps(() => ({
    opacity: Math.max(
      OP_FLOOR,
      Math.min((bodyR.value / BIRTH_MASCOT.r) * 1.4, 1),
    ),
  }));

  const limbPathProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, armsOp.value),
  }));

  const suckerPathProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, suckersOp.value),
  }));

  const faceProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, faceOp.value),
  }));

  const beanieProps = useAnimatedProps(() => ({
    opacity: Math.max(OP_FLOOR, beanieP.value),
  }));

  const pathPropsByPart = {
    body: bodyPathProps,
    limbs: limbPathProps,
    suckers: suckerPathProps,
    face: faceProps,
    beanie: beanieProps,
  } as const;

  const dot1Props = useAnimatedProps(() => {
    const dot = resolveBirthDotPosition(
      0,
      dotGather.value,
      orbit.value,
      catchP.value,
      bounceP.value,
      pokeP.value,
    );
    return {
      cx: dot.cx,
      cy: dot.cy,
      r: Math.max(
        R_FLOOR,
        LOGO_DOTS[0].r * Math.min(dot1.value, 1) * dot.rScale,
      ),
      opacity: Math.max(OP_FLOOR, Math.min(dot1.value * 2, 1)),
    };
  });

  const dot2Props = useAnimatedProps(() => {
    const dot = resolveBirthDotPosition(
      1,
      dotGather.value,
      orbit.value,
      catchP.value,
      bounceP.value,
      pokeP.value,
    );
    return {
      cx: dot.cx,
      cy: dot.cy,
      r: Math.max(
        R_FLOOR,
        LOGO_DOTS[1].r * Math.min(dot2.value, 1) * dot.rScale,
      ),
      opacity: Math.max(OP_FLOOR, Math.min(dot2.value * 2, 1)),
    };
  });

  const dot3Props = useAnimatedProps(() => {
    const dot = resolveBirthDotPosition(
      2,
      dotGather.value,
      orbit.value,
      catchP.value,
      bounceP.value,
      pokeP.value,
    );
    return {
      cx: dot.cx,
      cy: dot.cy,
      r: Math.max(
        R_FLOOR,
        LOGO_DOTS[2].r * Math.min(dot3.value, 1) * dot.rScale,
      ),
      opacity: Math.max(OP_FLOOR, Math.min(dot3.value * 2, 1)),
    };
  });

  const pokeTentacleProps = useAnimatedProps(() => ({
    transform: `translate(${pokeP.value * 92} ${pokeP.value * -30})`,
  }));

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
              cx={LOGO_MENTOR_NODE.cx}
              cy={LOGO_MENTOR_NODE.cy}
              fill={C.tealBright}
              animatedProps={mentorNodeProps}
              testID="mentor-birth-mentor-node"
            />
            <AnimatedCircle
              cx={LOGO_MENTOR_NODE.cx}
              cy={LOGO_MENTOR_NODE.cy}
              fill={C.mint}
              animatedProps={mentorNodeCoreProps}
              testID="mentor-birth-logo-mentor-node"
            />

            <AnimatedG
              testID="mentor-birth-mascot"
              transform={OCTO_MATE_BIRTH_TRANSFORM}
            >
              {OCTO_MATE_STATIC_PATHS.map((path) => (
                <AnimatedPath
                  key={path.sourceIndex}
                  d={path.d}
                  fill={path.fill}
                  animatedProps={pathPropsByPart[path.part]}
                  testID="mentor-birth-canonical-path"
                />
              ))}
              <AnimatedG
                animatedProps={pokeTentacleProps}
                testID="mentor-birth-poke-tentacle"
              >
                {OCTO_MATE_POKE_TENTACLE_PATHS.map((path) => (
                  <AnimatedPath
                    key={path.sourceIndex}
                    d={path.d}
                    fill={path.fill}
                    animatedProps={pathPropsByPart[path.part]}
                    testID="mentor-birth-poke-tentacle-path"
                  />
                ))}
              </AnimatedG>
              {OCTO_MATE_REPAIR_PATHS.map((path) => (
                <AnimatedPath
                  key={path.id}
                  d={path.d}
                  fill={path.fill}
                  animatedProps={pathPropsByPart[path.part]}
                  testID="mentor-birth-arm-tip-repair"
                />
              ))}
            </AnimatedG>

            <AnimatedCircle
              fill={LOGO_DOTS[0].fill}
              animatedProps={dot1Props}
              testID="mentor-birth-dot-pink"
            />
            <AnimatedCircle
              fill={LOGO_DOTS[1].fill}
              animatedProps={dot2Props}
              testID="mentor-birth-dot-violet"
            />
            <AnimatedCircle
              fill={LOGO_DOTS[2].fill}
              animatedProps={dot3Props}
              testID="mentor-birth-dot-mint"
            />
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
