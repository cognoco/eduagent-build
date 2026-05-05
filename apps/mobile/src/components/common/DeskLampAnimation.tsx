import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  Circle,
  Rect,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';

interface DeskLampAnimationProps {
  size?: number;
  color?: string;
  dark?: boolean;
  testID?: string;
}

const WARM = '#fbbf24';
const STAR_COLOR = '#fde68a';
const SHADE_INNER = '#ffe9b0';
const BRASS = '#c79a4a';
const BRASS_DEEP = '#8b6a2e';
const BRASS_HI = '#f0c97c';

const VB_W = 220;
const VB_H = 180;
const DESK_Y = 148;
const BASE_X = 56;
const ELBOW_X = 56;
const ELBOW_Y = 92;
const HEAD_X = 128;
const HEAD_Y = 58;
const TILT = 2;
const TILT_RAD = (TILT * Math.PI) / 180;
const RIM_CX = HEAD_X + Math.sin(TILT_RAD) * 36;
const RIM_CY = HEAD_Y + Math.cos(TILT_RAD) * 36;
const POOL_CX = RIM_CX + Math.sin(TILT_RAD) * 8;
const POOL_CY = DESK_Y + 2;

const CONE_D = `M ${RIM_CX - 24} ${RIM_CY - 1} L ${RIM_CX + 24} ${
  RIM_CY - 1
} L ${POOL_CX + 64} ${POOL_CY} L ${POOL_CX - 64} ${POOL_CY} Z`;
const BELL_D = 'M -10 1 C -16 8, -24 18, -28 34 L 28 34 C 24 18, 16 8, 10 1 Z';
const CORD_D = `M ${BASE_X - 18} ${DESK_Y + 1} Q ${BASE_X - 38} ${
  DESK_Y + 6
}, ${BASE_X - 56} ${DESK_Y + 2}`;

const PULSE_HALF_MS = 715;

interface StarSeed {
  x0: number;
  period: number;
  phase: number;
  sz: number;
}

function makeSeeds(n: number): StarSeed[] {
  let s = 23;
  const r = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const out: StarSeed[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x0: r(), period: 3.6 + 3.2 * r(), phase: r(), sz: 0.7 + r() });
  }
  return out;
}

const SEEDS = makeSeeds(18);

function StarMote({ seed, scale }: { seed: StarSeed; scale: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: seed.period * 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [progress, seed.period]);

  const ms = Math.max(3, seed.sz * scale * 3);

  const style = useAnimatedStyle(() => {
    const p = (progress.value + seed.phase) % 1;
    const yStart = RIM_CY - 2;
    const yEnd = POOL_CY;
    const y = yStart + (yEnd - yStart) * p;
    const halfW = 28 + 50 * p;
    const xCenter = RIM_CX + (POOL_CX - RIM_CX) * p;
    const x = xCenter + (seed.x0 * 2 - 1) * halfW;
    let env: number;
    if (p < 0.1) env = p / 0.1;
    else if (p > 0.92) env = (1 - p) / 0.08;
    else env = 1;
    return {
      opacity: env * 0.75,
      transform: [
        { translateX: x * scale - ms / 2 },
        { translateY: y * scale - ms / 2 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: ms,
          height: ms,
          borderRadius: ms / 2,
          backgroundColor: STAR_COLOR,
        },
        style,
        { pointerEvents: 'none' },
      ]}
    />
  );
}

export function DeskLampAnimation({
  size = 160,
  color,
  dark,
  testID,
}: DeskLampAnimationProps): ReactNode {
  const systemScheme = useColorScheme();
  const isDark = dark ?? systemScheme === 'dark';
  const reduceMotion = useReducedMotion();
  const arm = color ?? (isDark ? '#8fa3bd' : '#3a3a5e');
  const deskStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

  const svgW = size * (VB_W / VB_H);
  const scale = size / VB_H;

  const pulse = useSharedValue(reduceMotion ? 0.5 : 0);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, {
        duration: PULSE_HALF_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.55 * pulse.value,
  }));

  const poolStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.65 * pulse.value,
  }));

  const coneStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.55 * pulse.value,
  }));

  const shadeGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * pulse.value,
  }));

  const abs = {
    position: 'absolute' as const,
    width: svgW,
    height: size,
  };
  const np = { pointerEvents: 'none' as const };

  return (
    <View
      testID={testID}
      accessibilityLabel="Thinking"
      accessibilityRole="image"
      style={{ width: svgW, height: size }}
    >
      {/* Wall bloom */}
      <Animated.View style={[abs, glowStyle, np]}>
        <Svg width={svgW} height={size} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defs>
            <RadialGradient id="wb" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={WARM} stopOpacity="0.35" />
              <Stop offset="1" stopColor={WARM} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={HEAD_X + 4}
            cy={HEAD_Y + 18}
            rx={70}
            ry={48}
            fill="url(#wb)"
          />
        </Svg>
      </Animated.View>

      {/* Light pool */}
      <Animated.View style={[abs, poolStyle, np]}>
        <Svg width={svgW} height={size} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defs>
            <RadialGradient id="lp" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={WARM} stopOpacity="1" />
              <Stop offset="0.45" stopColor={WARM} stopOpacity="0.55" />
              <Stop offset="1" stopColor={WARM} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={POOL_CX}
            cy={POOL_CY + 4}
            rx={70}
            ry={14}
            fill="url(#lp)"
          />
          <Ellipse
            cx={POOL_CX}
            cy={POOL_CY + 3}
            rx={36}
            ry={8}
            fill={WARM}
            opacity={0.6}
          />
        </Svg>
      </Animated.View>

      {/* Light cone */}
      <Animated.View style={[abs, coneStyle, np]}>
        <Svg width={svgW} height={size} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defs>
            <LinearGradient id="lc" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={WARM} stopOpacity="0.85" />
              <Stop offset="1" stopColor={WARM} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Path d={CONE_D} fill="url(#lc)" />
        </Svg>
      </Animated.View>

      {/* Stardust */}
      {!reduceMotion &&
        SEEDS.map((seed, i) => <StarMote key={i} seed={seed} scale={scale} />)}

      {/* Bulb halo */}
      <Animated.View style={[abs, glowStyle, np]}>
        <Svg width={svgW} height={size} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defs>
            <RadialGradient id="bh" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={WARM} stopOpacity="0.95" />
              <Stop offset="0.5" stopColor={WARM} stopOpacity="0.4" />
              <Stop offset="1" stopColor={WARM} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={RIM_CX}
            cy={RIM_CY + 2}
            rx={28}
            ry={18}
            fill="url(#bh)"
          />
        </Svg>
      </Animated.View>

      {/* Lamp body (static) */}
      <Svg width={svgW} height={size} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Defs>
          <LinearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={BRASS_DEEP} />
            <Stop offset="0.35" stopColor={BRASS} />
            <Stop offset="1" stopColor={BRASS_HI} />
          </LinearGradient>
        </Defs>

        <Line
          x1={0}
          y1={DESK_Y}
          x2={VB_W}
          y2={DESK_Y}
          stroke={deskStroke}
          strokeWidth={1}
        />

        {/* Base */}
        <Ellipse
          cx={BASE_X}
          cy={DESK_Y + 1}
          rx={22}
          ry={4.5}
          fill={BRASS_DEEP}
          stroke={BRASS_HI}
          strokeWidth={0.8}
          strokeOpacity={isDark ? 0.9 : 0.35}
        />
        <Ellipse cx={BASE_X} cy={DESK_Y - 1} rx={22} ry={4.5} fill={BRASS} />
        <Ellipse cx={BASE_X} cy={DESK_Y - 6} rx={18} ry={3} fill={BRASS_DEEP} />
        <Rect
          x={BASE_X - 18}
          y={DESK_Y - 7}
          width={36}
          height={6}
          fill={BRASS}
        />
        <Ellipse cx={BASE_X} cy={DESK_Y - 7} rx={18} ry={2.5} fill={BRASS_HI} />
        <Circle cx={BASE_X + 12} cy={DESK_Y - 5} r={1.6} fill={BRASS_DEEP} />

        {/* Lower arm */}
        <Line
          x1={BASE_X}
          y1={DESK_Y - 8}
          x2={ELBOW_X}
          y2={ELBOW_Y}
          stroke={arm}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
        <Circle cx={ELBOW_X} cy={ELBOW_Y} r={4} fill={arm} />
        <Circle cx={ELBOW_X} cy={ELBOW_Y} r={1.8} fill={BRASS} opacity={0.7} />

        {/* Upper arm */}
        <Line
          x1={ELBOW_X}
          y1={ELBOW_Y}
          x2={HEAD_X}
          y2={HEAD_Y}
          stroke={arm}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
        <Circle cx={HEAD_X} cy={HEAD_Y} r={4} fill={arm} />
        <Circle cx={HEAD_X} cy={HEAD_Y} r={1.8} fill={BRASS} opacity={0.7} />

        {/* Shade */}
        <G transform={`translate(${HEAD_X} ${HEAD_Y}) rotate(${TILT})`}>
          <Ellipse cx={0} cy={0} rx={9} ry={2.5} fill={BRASS_DEEP} />
          <Ellipse cx={0} cy={-1.5} rx={9} ry={2} fill={BRASS} />
          <Path
            d={BELL_D}
            fill="url(#sg)"
            stroke={BRASS_DEEP}
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
          <Path
            d="M -7 4 C -12 12, -20 22, -24 32"
            stroke={BRASS_HI}
            strokeWidth={2.2}
            fill="none"
            opacity={0.85}
            strokeLinecap="round"
          />
          <Path
            d="M 7 4 C 12 12, 20 22, 24 32"
            stroke={BRASS_DEEP}
            strokeWidth={1.2}
            fill="none"
            opacity={0.55}
            strokeLinecap="round"
          />
          <Ellipse cx={0} cy={36} rx={28} ry={5} fill={BRASS_DEEP} />
        </G>

        {/* Cord */}
        <Path
          d={CORD_D}
          stroke={arm}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
          opacity={0.7}
        />
      </Svg>

      {/* Shade interior glow */}
      <Animated.View style={[abs, shadeGlowStyle, np]}>
        <Svg width={svgW} height={size} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <G transform={`translate(${HEAD_X} ${HEAD_Y}) rotate(${TILT})`}>
            <Ellipse
              cx={0}
              cy={35.5}
              rx={26}
              ry={4.2}
              fill={SHADE_INNER}
              opacity={0.95}
            />
            <Ellipse
              cx={0}
              cy={35.5}
              rx={20}
              ry={3.4}
              fill={WARM}
              opacity={0.85}
            />
            <Ellipse
              cx={0}
              cy={35.5}
              rx={12}
              ry={2.2}
              fill="#ffe9a3"
              opacity={0.85}
            />
            <Ellipse cx={0} cy={35.5} rx={5} ry={1.2} fill="#fff8dc" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}
