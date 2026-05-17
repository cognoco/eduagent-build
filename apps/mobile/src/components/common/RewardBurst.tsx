import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BrandCelebration } from './BrandCelebration';

export type RewardBurstVariant =
  | 'assessment'
  | 'capitals'
  | 'dictation'
  | 'guess_who'
  | 'recite'
  | 'vocabulary';

export type RewardBurstIntensity = 'answer' | 'round' | 'hero';

type Particle = {
  color: string;
  delay: number;
  endX: number;
  endY: number;
  size: number;
  startX: number;
  startY: number;
  symbol?: string;
};

type RewardBurstProps = {
  variant: RewardBurstVariant;
  intensity?: RewardBurstIntensity;
  message?: string;
  onComplete?: () => void;
  testID?: string;
};

const VARIANT_CONFIG: Record<
  RewardBurstVariant,
  { colors: string[]; icon: string; label: string }
> = {
  assessment: {
    colors: ['#22c55e', '#f59e0b', '#38bdf8', '#a855f7', '#f43f5e'],
    icon: '✓',
    label: 'Solid work',
  },
  capitals: {
    colors: ['#2563eb', '#14b8a6', '#facc15'],
    icon: '★',
    label: 'Correct',
  },
  dictation: {
    colors: ['#d97706', '#f59e0b', '#fde68a'],
    icon: 'D',
    label: 'Nice',
  },
  guess_who: {
    colors: ['#7c3aed', '#38bdf8', '#f0abfc'],
    icon: '?',
    label: 'Solved',
  },
  recite: {
    colors: ['#6d28d9', '#a78bfa', '#f5d0fe'],
    icon: 'R',
    label: 'Strong',
  },
  vocabulary: {
    colors: ['#059669', '#34d399', '#a7f3d0'],
    icon: 'W',
    label: 'Got it',
  },
};

const PARTICLE_COUNTS: Record<RewardBurstIntensity, number> = {
  answer: 16,
  round: 30,
  hero: 64,
};

const DURATIONS: Record<RewardBurstIntensity, number> = {
  answer: 850,
  round: 1200,
  hero: 1750,
};

function buildParticles({
  colors,
  height,
  intensity,
  symbol,
  width,
}: {
  colors: string[];
  height: number;
  intensity: RewardBurstIntensity;
  symbol: string;
  width: number;
}): Particle[] {
  const count = PARTICLE_COUNTS[intensity];
  const centerX = width / 2;
  const centerY =
    intensity === 'answer'
      ? Math.min(height * 0.34, 250)
      : intensity === 'hero'
        ? height * 0.42
        : height * 0.28;
  const spreadX = intensity === 'hero' ? width * 0.54 : width * 0.34;
  const spreadY =
    intensity === 'hero'
      ? height * 0.54
      : intensity === 'round'
        ? height * 0.28
        : 150;

  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const ring = 0.55 + (index % 5) * 0.12;
    const startWobble = ((index % 7) - 3) * 3;
    return {
      color: colors[index % colors.length] ?? colors[0] ?? '#22c55e',
      delay: (index % 8) * (intensity === 'hero' ? 18 : 12),
      endX: Math.cos(angle) * spreadX * ring,
      endY:
        Math.sin(angle) * spreadY * ring +
        (intensity === 'hero' ? Math.abs(Math.cos(angle)) * 120 : 36),
      size:
        intensity === 'hero'
          ? 10 + (index % 4) * 4
          : intensity === 'round'
            ? 8 + (index % 3) * 3
            : 7 + (index % 3) * 2,
      startX: centerX + startWobble,
      startY: centerY + ((index % 5) - 2) * 3,
      symbol: index % 6 === 0 ? symbol : undefined,
    };
  });
}

export function RewardBurst({
  variant,
  intensity = 'answer',
  message,
  onComplete,
  testID,
}: RewardBurstProps) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const config = VARIANT_CONFIG[variant];
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const badgeScale = useSharedValue(reduceMotion ? 1 : 0.7);
  const badgeOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const particles = useMemo(
    () =>
      buildParticles({
        colors: config.colors,
        height,
        intensity,
        symbol: config.icon,
        width,
      }),
    [config.colors, config.icon, height, intensity, width],
  );

  useEffect(() => {
    if (reduceMotion) {
      onCompleteRef.current?.();
      return;
    }

    progress.value = withTiming(1, {
      duration: DURATIONS[intensity],
      easing: Easing.out(Easing.cubic),
    });
    badgeOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withDelay(
        Math.max(320, DURATIONS[intensity] - 360),
        withTiming(0, { duration: 260 }),
      ),
    );
    badgeScale.value = withSequence(
      withSpring(1.12, { damping: 5, stiffness: 240 }),
      withTiming(1, { duration: 160 }),
    );

    const doneTimer = setTimeout(() => {
      onCompleteRef.current?.();
    }, DURATIONS[intensity] + 120);

    return () => clearTimeout(doneTimer);
  }, [badgeOpacity, badgeScale, intensity, progress, reduceMotion]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }));

  if (reduceMotion) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {particles.map((particle, index) => (
        <RewardParticle key={index} particle={particle} progress={progress} />
      ))}
      <Animated.View
        style={[
          styles.badge,
          badgeStyle,
          {
            backgroundColor: config.colors[0],
            top:
              intensity === 'hero'
                ? height * 0.2
                : intensity === 'round'
                  ? height * 0.16
                  : Math.min(height * 0.22, 170),
          },
        ]}
      >
        {intensity === 'hero' ? (
          <BrandCelebration size={80} testID={`${testID ?? 'reward'}-brand`} />
        ) : null}
        <Text style={styles.badgeText}>{message ?? config.label}</Text>
      </Animated.View>
    </View>
  );
}

function RewardParticle({
  particle,
  progress,
}: {
  particle: Particle;
  progress: { value: number };
}) {
  const particleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const rise = p < 0.55 ? p / 0.55 : 1;
    const fall = p < 0.55 ? 0 : (p - 0.55) / 0.45;
    return {
      opacity: p < 0.82 ? 1 : Math.max(0, 1 - (p - 0.82) / 0.18),
      transform: [
        { translateX: particle.endX * rise },
        { translateY: particle.endY * rise + fall * 80 },
        { rotate: `${p * 540 + particle.delay}deg` },
        { scale: p < 0.12 ? p / 0.12 : 1 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        particleStyle,
        {
          backgroundColor: particle.symbol ? 'transparent' : particle.color,
          borderRadius: particle.symbol ? 0 : particle.size / 3,
          height: particle.symbol ? particle.size * 2 : particle.size,
          left: particle.startX,
          top: particle.startY,
          width: particle.symbol ? particle.size * 2 : particle.size,
        },
      ]}
    >
      {particle.symbol ? (
        <Text style={[styles.symbol, { color: particle.color }]}>
          {particle.symbol}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 118,
    paddingHorizontal: 18,
    paddingVertical: 10,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  particle: {
    position: 'absolute',
  },
  symbol: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
    textAlign: 'center',
  },
});
